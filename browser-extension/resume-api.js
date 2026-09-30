// Authenticated client for the resume endpoints of the TrackTrail backend
// (/api/resume/*). It is the ONLY network code behind the "My Resumes"
// section, and it only ever talks to the TrackTrail API base URL — never to an
// AI provider. The backend owns validation, parsing, storage and tailoring.
//
// Dependencies are injected so the module is testable in Node:
//   chromeApi   { storage.session.get }    fetchImpl   fetch-compatible
//   defaultApiBaseUrl                       (the stored `apiBaseUrl` overrides it)

// `refreshSession` (optional) is the extension's ONE session-refresh flow, run by
// the background worker (message REFRESH_SESSION). This module never refreshes
// tokens itself — it only asks, then retries safe (GET) requests once.
export function createResumeApi({ chromeApi, fetchImpl, defaultApiBaseUrl, refreshSession }) {
  const doFetch = fetchImpl || ((...a) => globalThis.fetch(...a));
  const coded = (message, code, status) => Object.assign(new Error(message), { code, status: status ?? null });
  const SESSION_ENDED = () => coded("Your session ended. Sign in again.", "session_expired");

  async function baseUrl() {
    const { apiBaseUrl } = await chromeApi.storage.local.get("apiBaseUrl");
    return (apiBaseUrl || defaultApiBaseUrl).replace(/\/+$/, "");
  }

  async function accessToken() {
    const { accessToken: token } = await chromeApi.storage.session.get("accessToken");
    return token || null;
  }

  async function send(path, options, token) {
    try {
      return await doFetch(`${await baseUrl()}/resume${path}`, { ...options, headers: { token, "x-client": "extension", ...(options.headers || {}) } });
    } catch (e) {
      throw coded("Can't reach TrackTrail. Check your connection and try again.", "network");
    }
  }

  async function request(path, options = {}) {
    let token = await accessToken();
    if (!token && refreshSession) {
      if (!(await refreshSession())?.ok) throw SESSION_ENDED();
      token = await accessToken();
    }
    if (!token) throw coded("Not logged in or session ended. Sign in again.", "session_expired");
    const res = await send(path, options, token);
    if (res.status !== 401 || !refreshSession) return res;
    if (!(await refreshSession())?.ok) throw SESSION_ENDED();
    // Never replay a mutation (upload/activate/delete/export): ask the user to repeat it.
    if (String(options.method || "GET").toUpperCase() !== "GET") throw coded("Your session was restored. Please repeat that action.", "session_restored");
    return send(path, options, await accessToken());
  }

  // Same user-safe rules as background.js: 5xx bodies are never shown.
  async function failure(res) {
    const data = await res.json().catch(() => ({}));
    if (res.status >= 500) return coded("TrackTrail is having trouble right now. Please try again in a moment.", data.code || "server_error", res.status);
    const err = coded(data.message || `Request failed (${res.status})`, data.code || (res.status === 429 ? "rate_limited" : null), res.status);
    const retry = Number(data.retryAfterSeconds);
    if (Number.isFinite(retry) && retry > 0) err.retryAfterSeconds = Math.ceil(retry);
    return err;
  }

  async function json(path, options = {}) {
    const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
    const res = await request(path, {
      ...options,
      // JSON bodies get a JSON content type; a FormData body must NOT (the browser adds the multipart boundary)
      headers: { ...(options.body && !isForm ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
    });
    if (!res.ok) throw await failure(res);
    return res.json().catch(() => ({}));
  }

  async function blob(path, options = {}) {
    const res = await request(path, options);
    if (!res.ok) throw await failure(res);
    const filename = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1] || "resume";
    return [await res.blob(), filename];
  }

  return {
    listResumes: () => json("/resumes"),
    getResume: (id) => json(`/resumes/${id}`),
    activate: (id) => json(`/resumes/${id}/activate`, { method: "POST" }),
    remove: (id) => json(`/resumes/${id}`, { method: "DELETE" }),
    // The file goes to the TrackTrail backend ONLY (never to an AI provider).
    upload: (file) => {
      const form = new FormData();
      form.append("file", file);
      return json("/upload", { method: "POST", body: form });
    },
    getVersion: (id) => json(`/tailored/${id}`),
    // Flat, all-resumes view (GET /api/resume/versions) — distinct from the
    // per-resume `resumes[].versions` already nested in listResumes(), which
    // is what each resume card's "Versions" toggle renders. This one powers
    // a single "Recent tailored versions" list across every resume.
    listVersions: () => json("/versions"),
    exportVersion: (id, format) => blob(`/versions/${id}/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format }) }),
    downloadOriginal: (id) => blob(`/original/file?resumeId=${id}`),
  };
}
