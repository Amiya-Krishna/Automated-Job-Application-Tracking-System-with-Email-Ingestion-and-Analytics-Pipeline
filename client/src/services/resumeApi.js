// Thin client for the central Resume Tailoring API (/api/resume/*).
// No tailoring / matching / validation logic lives in the client: this file
// only calls the backend and shapes errors for the UI.
import api from "../api";

export const STAGES = [
  { key: "analyzing_resume", label: "Analyzing Resume…" },
  { key: "analyzing_jd", label: "Analyzing Job Description…" },
  { key: "matching", label: "Matching Requirements…" },
  { key: "generating", label: "Generating Tailored Resume…" },
  { key: "validating", label: "Validating Changes…" },
  { key: "ready", label: "Resume Ready" },
];

/** Error carrying the API's machine-readable code (e.g. "no_resume"). */
export class ResumeApiError extends Error {
  constructor(message, { code = null, status = null } = {}) {
    super(message);
    this.name = "ResumeApiError";
    this.code = code;
    this.status = status;
  }
}

export function toApiError(err, fallback = "Something went wrong. Please try again.") {
  if (err instanceof ResumeApiError) return err;
  const data = err?.response?.data;
  if (data?.message) return new ResumeApiError(data.message, { code: data.code, status: err.response.status });
  if (err?.code === "ERR_NETWORK") return new ResumeApiError("Can't reach the server. Check your connection and try again.", { code: "network" });
  return new ResumeApiError(fallback);
}

const call = async (fn) => {
  try {
    return (await fn()).data;
  } catch (err) {
    throw toApiError(err);
  }
};

/** "tracked-12" | "engine-33" -> the `job` object the API expects. */
export function jobFromKey(key) {
  const m = /^(tracked|engine)-(\d+)$/.exec(key || "");
  if (!m) return null;
  return m[1] === "tracked" ? { trackedJobId: Number(m[2]) } : { engineJobId: Number(m[2]) };
}

export const getCurrentResume = () => call(() => api.get("/resume/current"));
export const uploadResume = (file, { syncProfile = false } = {}) => {
  const form = new FormData();
  form.append("file", file);
  form.append("syncProfile", String(syncProfile));
  return call(() => api.post("/resume/upload", form));
};
export const getMatchAnalysis = (jobKey) => call(() => api.get(`/resume/match-analysis/${encodeURIComponent(jobKey)}`));
export const analyzeJob = (payload) => call(() => api.post("/resume/analyze", payload));
export const startTailoring = (payload) => call(() => api.post("/resume/tailor", payload));
export const getSession = (id) => call(() => api.get(`/resume/sessions/${id}`));
export const getVersion = (id) => call(() => api.get(`/resume/tailored/${id}`));
export const listVersions = () => call(() => api.get("/resume/versions"));
export const previewVersion = (id, decisions) => call(() => api.post(`/resume/versions/${id}/preview`, { decisions }));
export const approveVersion = (id, body) => call(() => api.post(`/resume/versions/${id}/approve`, body));

/**
 * Poll a tailoring session until it finishes. Calls onUpdate(session) for
 * every poll so the UI can show the REAL current stage (not a fake timer).
 */
export async function waitForSession(id, { onUpdate, intervalMs = 1000, timeoutMs = 180_000, signal, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const started = Date.now();
  for (;;) {
    if (signal?.aborted) throw new ResumeApiError("Cancelled.", { code: "cancelled" });
    const s = await getSession(id);
    onUpdate?.(s);
    if (s.status === "succeeded") return s;
    if (s.status === "failed") throw new ResumeApiError(s.error || "Tailoring failed.", { code: s.errorCode });
    if (Date.now() - started > timeoutMs) throw new ResumeApiError("This is taking longer than expected. Please try again.", { code: "timeout" });
    await sleep(intervalMs);
  }
}

/** Download an export (or the untouched original with id "original"). */
export async function downloadExport(id, format) {
  let res;
  try {
    res = await api.post(`/resume/versions/${id}/export`, { format }, { responseType: "blob" });
  } catch (err) {
    // blob error bodies need decoding to read the API message
    const blob = err?.response?.data;
    if (blob instanceof Blob) {
      try {
        const j = JSON.parse(await blob.text());
        throw new ResumeApiError(j.message || "Export failed.", { code: j.code, status: err.response.status });
      } catch (inner) {
        if (inner instanceof ResumeApiError) throw inner;
      }
    }
    throw toApiError(err, "Export failed.");
  }
  const cd = res.headers["content-disposition"] || "";
  const filename = /filename="([^"]+)"/.exec(cd)?.[1] || `resume.${format}`;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return filename;
}
