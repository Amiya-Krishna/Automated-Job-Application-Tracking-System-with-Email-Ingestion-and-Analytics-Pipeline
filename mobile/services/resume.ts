/**
 * Client for the central Resume Tailoring API (/api/resume/*). Uses the shared
 * `api` instance, so auth (the `token` header), error normalisation and the
 * 401 handling all come from services/api.ts. No tailoring logic lives here.
 */
// SDK 54+ moved cacheDirectory/writeAsStringAsync/EncodingType to the
// legacy subpath; the new top-level API is class-based (Paths/File/
// Directory) and doesn't expose these. Importing from here keeps this
// file's API surface unchanged.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { api } from "@/services/api";
import { ApiError } from "@/types/api";
import type {
  ApproveAction,
  CurrentResume,
  MatchAnalysis,
  ResumeJobInput,
  ResumeList,
  ResumeListItem,
  ReviewDecision,
  TailoredVersion,
  TailoringSession,
  VersionList,
} from "@/types/resume";
import {
  arrayBufferToBase64,
  filenameFromContentDisposition,
} from "@/utils/binary";

export const STAGES: { key: string; label: string }[] = [
  { key: "analyzing_resume", label: "Analyzing Resume…" },
  { key: "analyzing_jd", label: "Analyzing Job Description…" },
  { key: "matching", label: "Matching Requirements…" },
  { key: "generating", label: "Generating Tailored Resume…" },
  { key: "validating", label: "Validating Changes…" },
  { key: "ready", label: "Resume Ready" },
];

/** "tracked-12" | "engine-33" → the `job` object the API expects. */
export function jobFromKey(
  key: string | undefined | null,
): ResumeJobInput | null {
  const m = /^(tracked|engine)-(\d+)$/.exec(key ?? "");
  if (!m) return null;
  return m[1] === "tracked"
    ? { trackedJobId: Number(m[2]) }
    : { engineJobId: Number(m[2]) };
}

export async function getCurrentResume(): Promise<CurrentResume> {
  const { data } = await api.get<CurrentResume>("/resume/current");
  return data;
}

/** Every resume of the signed-in user, the active one flagged. Backend is the source of truth. */
export async function listResumes(): Promise<ResumeList> {
  const { data } = await api.get<ResumeList>("/resume/resumes");
  return data;
}

/**
 * Uploads a PDF/DOCX resume through the SAME backend endpoint (`POST
 * /resume/upload`) the web client and browser extension use, so the new
 * resume is stored as a normal backend record — no local copy is kept on
 * the device. `file` matches what `expo-document-picker` returns for a
 * successful pick (uri/name/mimeType). The backend re-validates size, type
 * and content regardless of what's sent here.
 */
export async function uploadResume(
  file: { uri: string; name: string; mimeType?: string | null },
  { syncProfile = false }: { syncProfile?: boolean } = {},
): Promise<{ resume: ResumeListItem }> {
  const form = new FormData();
  // React Native's FormData accepts this {uri, name, type} shape (not a real Blob/File) for multipart uploads.
  form.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType || "application/octet-stream",
  } as unknown as Blob);
  form.append("syncProfile", String(syncProfile));
  const { data } = await api.post<{ resume: ResumeListItem }>(
    "/resume/upload",
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return data;
}

/** GET /api/resume/resumes/:id — one resume's parsed text, same record web/extension read. */
export async function getResumeDetail(
  id: number,
): Promise<{ resume: ResumeListItem; resumeText: string }> {
  const { data } = await api.get<{
    resume: ResumeListItem;
    resumeText: string;
  }>(`/resume/resumes/${id}`);
  return data;
}

export async function activateResume(id: number): Promise<ResumeList> {
  const { data } = await api.post<ResumeList>(`/resume/resumes/${id}/activate`);
  return data;
}

export async function deleteResume(
  id: number,
): Promise<ResumeList & { deleted: boolean; deletedVersions: number }> {
  const { data } = await api.delete<
    ResumeList & { deleted: boolean; deletedVersions: number }
  >(`/resume/resumes/${id}`);
  return data;
}

export async function analyzeJob(
  job: ResumeJobInput,
  resumeId?: number,
): Promise<MatchAnalysis> {
  const { data } = await api.post<MatchAnalysis>("/resume/analyze", {
    job,
    ...(resumeId ? { resumeId } : {}),
  });
  return data;
}

/**
 * GET /api/resume/match-analysis/:jobKey — the server's CACHED, deterministic
 * (no LLM call) analysis for a job, keyed by "tracked-<id>" / "engine-<id>"
 * (see jobFromKey's inverse — callers pass the same key string, not a
 * `ResumeJobInput`). Distinct from `analyzeJob` above (`POST /resume/analyze`),
 * which always runs a fresh analysis; this is the cheap re-read the web
 * client uses when reopening a job it already analyzed.
 */
export async function getMatchAnalysis(
  jobKey: string,
  resumeId?: number,
): Promise<MatchAnalysis> {
  const { data } = await api.get<MatchAnalysis>(
    `/resume/match-analysis/${encodeURIComponent(jobKey)}`,
    {
      params: resumeId ? { resumeId } : undefined,
    },
  );
  return data;
}

export async function startTailoring(
  job: ResumeJobInput,
  regenerate = false,
  resumeId?: number,
): Promise<TailoringSession> {
  const { data } = await api.post<TailoringSession>("/resume/tailor", {
    job,
    ...(regenerate ? { regenerate: true } : {}),
    ...(resumeId ? { resumeId } : {}),
  });
  return data;
}

export async function getSession(id: string): Promise<TailoringSession> {
  const { data } = await api.get<TailoringSession>(
    `/resume/sessions/${encodeURIComponent(id)}`,
  );
  return data;
}

export async function getVersion(id: number): Promise<TailoredVersion> {
  const { data } = await api.get<TailoredVersion>(`/resume/tailored/${id}`);
  return data;
}

export async function listVersions(): Promise<VersionList> {
  const { data } = await api.get<VersionList>("/resume/versions");
  return data;
}

/**
 * Saves a downloaded resume file to the device's cache dir and opens the
 * native share sheet — the mobile equivalent of the web client's browser
 * download (client/src/services/resumeApi.js's saveResponseBlob). Mobile
 * has no Downloads-folder concept, so "download" here means "hand the file
 * to the OS share sheet", where the user picks Save to Files, AirDrop,
 * open in another app, etc.
 */
async function saveAndShare(
  bytes: ArrayBuffer,
  contentDisposition: string | undefined,
  fallbackName: string,
): Promise<string> {
  const filename = filenameFromContentDisposition(
    contentDisposition,
    fallbackName,
  );
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, arrayBufferToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri);
  }
  return filename;
}

/** Downloads (and opens the share sheet for) the exact file the user uploaded for a resume. */
export async function downloadOriginalFile(resumeId: number): Promise<string> {
  const res = await api.get("/resume/original/file", {
    params: { resumeId },
    responseType: "arraybuffer",
  });
  return saveAndShare(res.data, res.headers["content-disposition"], "resume");
}

/** Downloads (and opens the share sheet for) an export — or the untouched original with id "original". */
export async function downloadExport(
  id: number | "original",
  format: string,
): Promise<string> {
  const res = await api.post(
    `/resume/versions/${id}/export`,
    { format },
    { responseType: "arraybuffer" },
  );
  return saveAndShare(
    res.data,
    res.headers["content-disposition"],
    `resume.${format}`,
  );
}

export async function previewVersion(
  id: number,
  decisions: Record<string, ReviewDecision>,
): Promise<{ resumeText: string; status: string }> {
  const { data } = await api.post<{ resumeText: string; status: string }>(
    `/resume/versions/${id}/preview`,
    { decisions },
  );
  return data;
}

export async function approveVersion(
  id: number,
  body: { action: ApproveAction; decisions?: Record<string, ReviewDecision> },
): Promise<TailoredVersion> {
  const { data } = await api.post<TailoredVersion>(
    `/resume/versions/${id}/approve`,
    body,
  );
  return data;
}

interface WaitOptions {
  onUpdate?: (s: TailoringSession) => void;
  intervalMs?: number;
  timeoutMs?: number;
  isCancelled?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  /** injectable for tests */
  fetchSession?: (id: string) => Promise<TailoringSession>;
}

/**
 * Poll a tailoring session until it finishes, reporting the REAL stage the
 * server is in (not a fake timer). Rejects with an ApiError carrying the
 * server's error code (e.g. "no_matching_skills") if the run failed.
 */
export async function waitForSession(
  id: string,
  opts: WaitOptions = {},
): Promise<TailoringSession> {
  const {
    onUpdate,
    intervalMs = 1000,
    timeoutMs = 180_000,
    isCancelled,
    sleep = (ms) => new Promise<void>((r) => setTimeout(r, ms)),
    fetchSession = getSession,
  } = opts;
  const started = Date.now();
  for (;;) {
    if (isCancelled?.())
      throw new ApiError("Cancelled.", null, false, null, "cancelled");
    const s = await fetchSession(id);
    onUpdate?.(s);
    if (s.status === "succeeded") return s;
    if (s.status === "failed")
      throw new ApiError(
        s.error ?? "Tailoring failed.",
        null,
        false,
        null,
        s.errorCode,
      );
    if (Date.now() - started > timeoutMs)
      throw new ApiError(
        "This is taking longer than expected. Please try again.",
        null,
        false,
        null,
        "timeout",
      );
    await sleep(intervalMs);
  }
}
