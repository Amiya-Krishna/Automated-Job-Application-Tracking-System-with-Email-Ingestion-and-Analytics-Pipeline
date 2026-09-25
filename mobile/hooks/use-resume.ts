import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { emitNotificationEvent } from "@/services/notifications";
import {
  activateResume,
  analyzeJob,
  approveVersion,
  deleteResume,
  downloadExport,
  downloadOriginalFile,
  getCurrentResume,
  getMatchAnalysis,
  getResumeDetail,
  getVersion,
  listResumes,
  listVersions,
  previewVersion,
  startTailoring,
  uploadResume,
  waitForSession,
} from "@/services/resume";
import { ApiError } from "@/types/api";
import type {
  ApproveAction,
  ResumeJobInput,
  ReviewDecision,
  TailoredVersion,
} from "@/types/resume";

/** The resume TrackTrail will tailor (original — never modified). */
export function useCurrentResume() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["resume", "current"],
    queryFn: getCurrentResume,
    enabled: status === "authenticated",
  });
}

/** All resumes (active flagged) — the same records the web client and the extension show. */
export function useResumes() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["resume", "list"],
    queryFn: listResumes,
    enabled: status === "authenticated",
  });
}

export function useActivateResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => activateResume(id),
    onSuccess: (list) => {
      qc.setQueryData(["resume", "list"], list);
      void qc.invalidateQueries({ queryKey: ["resume", "current"] });
      void qc.invalidateQueries({ queryKey: ["resume", "analysis"] });
    },
  });
}

/**
 * Uploads a resume, then refreshes every resume-derived query so the new
 * (now-active) resume shows up immediately — same invalidation shape as
 * useActivateResume, since a fresh upload also becomes the active resume.
 */
export function useUploadResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      syncProfile,
    }: {
      file: { uri: string; name: string; mimeType?: string | null };
      syncProfile?: boolean;
    }) => uploadResume(file, { syncProfile }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["resume"] });
    },
  });
}

/** One resume's parsed text (`GET /resume/resumes/:id`) — the same record listResumes summarises. */
export function useResumeDetail(id: number | null) {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["resume", "detail", id],
    queryFn: () => getResumeDetail(id as number),
    enabled: status === "authenticated" && id !== null,
  });
}

/**
 * The server's cached, deterministic match analysis for a job (no LLM,
 * no fresh run) — used when re-opening a job someone already analyzed
 * (e.g. via a shared jobKey), mirroring the web client's `?analysis=`
 * deep-link handling in ResumeTailoring.jsx. `retry: false` for the same
 * reason as useJobAnalysis: a 404/422 here is an answer, not a fluke.
 */
export function useCachedMatchAnalysis(
  jobKey: string | null,
  resumeId?: number,
) {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["resume", "cachedAnalysis", jobKey, resumeId ?? null],
    queryFn: () => getMatchAnalysis(jobKey as string, resumeId),
    enabled: status === "authenticated" && jobKey !== null,
    retry: false,
  });
}

/** Downloads the original uploaded file and opens the native share sheet. */
export function useDownloadOriginalResume() {
  return useMutation({
    mutationFn: (resumeId: number) => downloadOriginalFile(resumeId),
  });
}

/** Downloads a tailored export (or "original") in the given format and opens the share sheet. */
export function useDownloadResumeExport() {
  return useMutation({
    mutationFn: ({ id, format }: { id: number | "original"; format: string }) =>
      downloadExport(id, format),
  });
}

export function useDeleteResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteResume(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["resume"] });
    },
  });
}

export function useVersions() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["resume", "versions"],
    queryFn: listVersions,
    enabled: status === "authenticated",
  });
}

export function useVersion(id: number | null) {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["resume", "version", id],
    queryFn: () => getVersion(id as number),
    enabled: status === "authenticated" && id !== null,
  });
}

/**
 * Deterministic match analysis for a job (no LLM). The server caches it, so
 * re-opening the screen is cheap. `retry: false` — a 422 ("no resume", "JD too
 * short") is an answer, not a transient failure.
 */
export function useJobAnalysis(job: ResumeJobInput | null, resumeId?: number) {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["resume", "analysis", job, resumeId ?? null],
    queryFn: () => analyzeJob(job as ResumeJobInput, resumeId),
    enabled: status === "authenticated" && job !== null,
    retry: false,
  });
}

export function usePreviewVersion() {
  return useMutation({
    mutationFn: ({
      id,
      decisions,
    }: {
      id: number;
      decisions: Record<string, ReviewDecision>;
    }) => previewVersion(id, decisions),
  });
}

export function useApproveVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      decisions,
    }: {
      id: number;
      action: ApproveAction;
      decisions?: Record<string, ReviewDecision>;
    }) => approveVersion(id, { action, decisions }),
    onSuccess: (version: TailoredVersion) => {
      qc.setQueryData(["resume", "version", version.id], version);
      void qc.invalidateQueries({ queryKey: ["resume", "versions"] });
    },
  });
}

/** Runs one tailoring session, exposing the REAL server stage for the progress UI. */
export function useTailoring() {
  const qc = useQueryClient();
  const [stage, setStage] = useState<string | null>(null);
  const [isRunning, setRunning] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const cancelled = useRef(false);

  const run = useCallback(
    async (
      job: ResumeJobInput,
      regenerate = false,
      resumeId?: number,
    ): Promise<number | null> => {
      cancelled.current = false;
      setError(null);
      setNotes([]);
      setRunning(true);
      setStage("analyzing_resume");
      try {
        const session = await startTailoring(job, regenerate, resumeId);
        const done = await waitForSession(session.id, {
          onUpdate: (s) => setStage(s.stage),
          isCancelled: () => cancelled.current,
        });
        setNotes(done.warnings ?? []);
        void qc.invalidateQueries({ queryKey: ["resume", "versions"] });
        if (done.versionId !== null)
          emitNotificationEvent({
            type: "resume_tailored",
            versionId: done.versionId,
          });
        return done.versionId;
      } catch (e) {
        setError(
          e instanceof ApiError
            ? e
            : new ApiError(
                "Something went wrong. Please try again.",
                null,
                false,
              ),
        );
        return null;
      } finally {
        setRunning(false);
      }
    },
    [qc],
  );

  const cancel = useCallback(() => {
    cancelled.current = true;
  }, []);
  return { run, cancel, stage, isRunning, error, notes };
}
