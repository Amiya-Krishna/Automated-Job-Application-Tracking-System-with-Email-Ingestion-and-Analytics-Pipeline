import { DEFAULT_API_BASE_URL, DEFAULT_WEB_APP_URL } from "./config.js";

async function getApiBaseUrl() {
  const { apiBaseUrl } = await chrome.storage.local.get("apiBaseUrl");
  return (apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

async function getWebAppUrl() {
  const { webAppUrl } = await chrome.storage.local.get("webAppUrl");
  return (webAppUrl || DEFAULT_WEB_APP_URL).replace(/\/+$/, "");
}

// Tokens are intentionally session-only. A browser restart requires login
// again, while a service-worker restart restores the rotating refresh token
// from chrome.storage.session without ever writing credentials to disk.
const sessionStore = () => chrome.storage.session;
async function getSession() { return sessionStore().get(["accessToken", "refreshToken", "user"]); }
async function clearSession() { await sessionStore().remove(["accessToken", "refreshToken", "user"]); }

async function refreshSession() {
  const { refreshToken } = await getSession();
  if (!refreshToken) return null;
  const base = await getApiBaseUrl();
  const res = await fetch(`${base}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json", "x-client": "extension" }, body: JSON.stringify({ refreshToken }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.accessToken || !data.refreshToken) { await clearSession(); return null; }
  await sessionStore().set({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
  return data.accessToken;
}

async function getToken() {
  const { accessToken } = await getSession();
  return accessToken || refreshSession();
}

async function authorizedFetch(path, options = {}) {
  const base = await getApiBaseUrl();
  let token = await getToken();
  if (!token) throw Object.assign(new Error("Not logged in or session ended. Sign in again."), { code: "session_expired" });
  const request = (value) => fetch(`${base}${path}`, { ...options, headers: { "x-client": "extension", token: value, ...(options.headers || {}) } });
  let res = await request(token);
  if (res.status !== 401) return res;
  token = await refreshSession();
  if (!token) throw Object.assign(new Error("Your session has ended. Sign in again."), { code: "session_expired" });
  // Never automatically repeat a mutation. POST /jobs is idempotent server-side,
  // but resume/apply endpoints are not assumed safe to replay.
  if (!["GET", "HEAD", "OPTIONS"].includes((options.method || "GET").toUpperCase())) {
    throw Object.assign(new Error("Your session was restored. Please repeat that action."), { code: "session_restored" });
  }
  return request(token);
}

async function register(name, email, password) {
  const base = await getApiBaseUrl();

  const res = await fetch(`${base}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.message || "Registration failed");
  }

  return data;
}

async function login(email, password) {
  const base = await getApiBaseUrl();

  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-client": "extension" },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Login failed");
  }

  if (!data.accessToken || !data.refreshToken) throw new Error("The server did not create a secure session.");
  await sessionStore().set({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
  return data.user;
}

async function logout() {
  const { refreshToken } = await getSession();
  try {
    if (refreshToken) {
      const base = await getApiBaseUrl();
      await fetch(`${base}/auth/logout`, { method: "POST", headers: { "Content-Type": "application/json", "x-client": "extension" }, body: JSON.stringify({ refreshToken }) });
    }
  } finally { await clearSession(); }
}

async function saveJob(job) {
  // `job` is passed through as-is from content.js (company, role, status,
  // notes, location, description, sourceName, sourceUrl, externalJobId) —
  // the backend's POST /api/jobs is the single source of truth for which
  // fields matter and how dedup works, so we don't reshape it here.
  const res = await authorizedFetch("/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(job),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Failed to save job");
  }

  return data;
}

// Marks an already-saved job (by TrackedJob id) as Applied. Reuses the
// existing PUT /api/jobs/:id update path — no separate "applications"
// concept in the extension, since TrackedJob.status is the field the
// unified Applied Jobs page already reads.
async function markApplied(id) {
  return updateJob(id, { status: "Applied" });
}

async function getJobs() {
  const res = await authorizedFetch("/jobs", { method: "GET" });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Failed to load jobs");
  }

  return data;
}

async function updateJob(id, updates) {
  if (!id) {
    throw new Error("Missing job id.");
  }

  const res = await authorizedFetch(`/jobs/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.message || "Failed to update job");
  }

  return data;
}

async function deleteJob(id) {
  if (!id) {
    throw new Error("Missing job id.");
  }

  const res = await authorizedFetch(`/jobs/${id}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Failed to delete job");
  }

  return true;
}

// ---- Resume Tailoring --------------------------------------------------
// The extension holds NO tailoring/AI logic and NO AI credentials: it forwards
// the extracted job to the authenticated backend (/api/resume/*) and returns
// whatever the API says. Machine-readable error codes (e.g. "no_resume") are
// passed through so the panel can show the right call to action.
async function resumeApi(path, { method = "GET", body } = {}) {
  const res = await authorizedFetch(`/resume${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.message || "Resume request failed");
    err.code = data.code || null;
    throw err;
  }

  return data;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case "REGISTER": {
          const result = await register(message.name, message.email, message.password);
          sendResponse({ ok: true, result });
          break;
        }
        case "LOGIN": {
          const user = await login(message.email, message.password);
          sendResponse({ ok: true, user });
          break;
        }
        case "LOGOUT": {
          await logout();
          sendResponse({ ok: true });
          break;
        }
        case "GET_SESSION": {
          const token = await getToken();
          if (!token) { sendResponse({ ok: true, loggedIn: false, user: null }); break; }
          const res = await authorizedFetch("/auth/me", { method: "GET" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { await clearSession(); sendResponse({ ok: true, loggedIn: false, user: null }); break; }
          await sessionStore().set({ user: data.user });
          sendResponse({ ok: true, loggedIn: true, user: data.user });
          break;
        }
        case "API_REQUEST": {
          const res = await authorizedFetch(message.path, message.options || {});
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw Object.assign(new Error(data.message || "Request failed"), { code: data.code || null, status: res.status });
          sendResponse({ ok: true, data });
          break;
        }
        case "GET_DETECTED_JOB": {
          // Ask the active tab's content script (jd-extract.js + content.js,
          // only present on the LinkedIn/Indeed job pages manifest.json
          // matches) what it can see. A tab with no listener there — any
          // other site, or a page that hasn't finished loading the content
          // script yet — rejects instead of responding, which we treat as
          // "nothing to detect here" rather than surfacing an error, since
          // that's simply most tabs most of the time.
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) {
            sendResponse({ ok: true, supported: false, found: false });
            break;
          }
          try {
            const reply = await chrome.tabs.sendMessage(tab.id, { type: "TT_GET_DETECTED_JOB" });
            sendResponse({ ok: true, supported: true, found: Boolean(reply?.found), job: reply?.job || null, saveJob: reply?.saveJob || null });
          } catch (e) {
            sendResponse({ ok: true, supported: false, found: false });
          }
          break;
        }
        case "SAVE_JOB": {
          const job = await saveJob(message.job);
          sendResponse({ ok: true, job, duplicate: Boolean(job.duplicate) });
          break;
        }
        case "MARK_APPLIED": {
          const job = await markApplied(message.id);
          sendResponse({ ok: true, job });
          break;
        }
        case "GET_JOBS": {
          const jobs = await getJobs();
          sendResponse({ ok: true, jobs });
          break;
        }
        case "UPDATE_JOB": {
          const job = await updateJob(message.id, message.updates);
          sendResponse({ ok: true, job });
          break;
        }
        case "DELETE_JOB": {
          await deleteJob(message.id);
          sendResponse({ ok: true });
          break;
        }
        case "RESUME_LIST": {
          // the backend is the source of truth for resumes — nothing is cached in the extension
          const resumes = await resumeApi("/resumes");
          sendResponse({ ok: true, resumes });
          break;
        }
        case "RESUME_ANALYZE": {
          const analysis = await resumeApi("/analyze", { method: "POST", body: { job: message.job, ...(message.resumeId ? { resumeId: message.resumeId } : {}) } });
          sendResponse({ ok: true, analysis });
          break;
        }
        case "RESUME_TAILOR": {
          const session = await resumeApi("/tailor", { method: "POST", body: { job: message.job, ...(message.resumeId ? { resumeId: message.resumeId } : {}) } });
          sendResponse({ ok: true, session });
          break;
        }
        case "RESUME_SESSION": {
          const session = await resumeApi(`/sessions/${encodeURIComponent(message.id)}`);
          sendResponse({ ok: true, session });
          break;
        }
        case "RESUME_VERSION": {
          const version = await resumeApi(`/tailored/${encodeURIComponent(message.id)}`);
          sendResponse({ ok: true, version });
          break;
        }
        case "GET_WEB_URL": {
          sendResponse({ ok: true, url: await getWebAppUrl() });
          break;
        }
        default:
          sendResponse({ ok: false, error: "Unknown message type" });
      }
    } catch (err) {
      const code = err.code || null;
      const message = code === "session_expired" ? "Not logged in or session ended. Sign in again." : code === "session_restored" ? "Your session was restored. Please repeat that action." : err.message || "Something went wrong. Please try again.";
      sendResponse({ ok: false, error: message, code });
    }
  })();

  // Keep the message channel open for the async response above.
  return true;
});
