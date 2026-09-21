// Authenticated client for the resume endpoints of the TrackTrail backend
// (/api/resume/*). It is the ONLY network code behind the "My Resumes"
// section, and it only ever talks to the TrackTrail API base URL — never to an
// AI provider. The backend owns validation, parsing, storage and tailoring.
//
// Dependencies are injected so the module is testable in Node:
//   chromeApi   { storage.local.get }      fetchImpl   fetch-compatible
//   defaultApiBaseUrl                       (the stored `apiBaseUrl` overrides it)

export function createResumeApi({ chromeApi, fetchImpl, defaultApiBaseUrl }) {
  const doFetch = fetchImpl || ((...a) => globalThis.fetch(...a));

  async function baseUrl() {
    const { apiBaseUrl } = await chromeApi.storage.local.get("apiBaseUrl");
    return (apiBaseUrl || defaultApiBaseUrl).replace(/\/+$/, "");
  }

  async function authHeaders() {
    const { token } = await chromeApi.storage.local.get("token");
    if (!token) throw new Error("Not logged in. Open the extension popup and sign in first.");
    return { token };
  }

  async function request(path, options = {}) {
    return doFetch(`${await baseUrl()}/resume${path}`, { ...options, headers: { ...(await authHeaders()), ...(options.headers || {}) } });
  }

  async function json(path, options = {}) {
    const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
    const res = await request(path, {
      ...options,
      // JSON bodies get a JSON content type; a FormData body must NOT (the browser adds the multipart boundary)
      headers: { ...(options.body && !isForm ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.message || `Request failed (${res.status})`), { code: data.code || null, status: res.status });
    return data;
  }

  async function blob(path, options = {}) {
    const res = await request(path, options);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw Object.assign(new Error(data.message || `Request failed (${res.status})`), { code: data.code || null, status: res.status });
    }
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
    exportVersion: (id, format) => blob(`/versions/${id}/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format }) }),
    downloadOriginal: (id) => blob(`/original/file?resumeId=${id}`),
  };
}
