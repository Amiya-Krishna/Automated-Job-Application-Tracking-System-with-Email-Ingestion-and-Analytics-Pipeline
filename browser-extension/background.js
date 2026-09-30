import { DEFAULT_API_BASE_URL, DEFAULT_WEB_APP_URL } from "./config.js";

async function getApiBaseUrl() {
  const { apiBaseUrl } = await chrome.storage.local.get("apiBaseUrl");
  return (apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

async function getWebAppUrl() {
  const { webAppUrl } = await chrome.storage.local.get("webAppUrl");
  return (webAppUrl || DEFAULT_WEB_APP_URL).replace(/\/+$/, "");
}

// User-safe messages. Raw backend/network errors never reach the UI: anything
// that is not a TTError below is reported with GENERIC_MESSAGE.
const NETWORK_MESSAGE = "Can't reach TrackTrail. Check your connection and try again.";
const SERVER_MESSAGE = "TrackTrail is having trouble right now. Please try again in a moment.";
const GENERIC_MESSAGE = "Something went wrong. Please try again.";

class TTError extends Error {
  constructor(message, { code = null, retryAfterSeconds = null } = {}) {
    super(message);
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// fetch that reports connectivity problems as a coded, user-safe error
async function netFetch(url, init) {
  try { return await fetch(url, init); } catch (e) { throw new TTError(NETWORK_MESSAGE, { code: "network" }); }
}

// Turn a non-OK response into a TTError. 5xx bodies are replaced with a generic
// message (they can contain stack traces / internals); 4xx messages are the
// API's own user-facing validation text and pass through with their `code`.
async function apiError(res, fallback) {
  const data = await res.json().catch(() => ({}));
  const retry = Number(data.retryAfterSeconds ?? res.headers?.get?.("retry-after"));
  const retryAfterSeconds = Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : null;
  if (res.status >= 500) return new TTError(SERVER_MESSAGE, { code: data.code || "server_error" });
  const message = typeof data.message === "string" && data.message ? data.message : fallback;
  return new TTError(message, { code: data.code || (res.status === 429 ? "rate_limited" : null), retryAfterSeconds });
}

// Tokens are intentionally session-only. A browser restart requires login
// again, while a service-worker restart restores the rotating refresh token
// from chrome.storage.session without ever writing credentials to disk.
const sessionStore = () => chrome.storage.session;
async function getSession() { return sessionStore().get(["accessToken", "refreshToken", "user"]); }
async function clearSession() { await sessionStore().remove(["accessToken", "refreshToken", "user"]); }

// Single-flight: the refresh token rotates, so two concurrent refreshes (popup
// loads jobs + session at once) would make the second reuse a spent token.
let refreshing = null;
function refreshSession() {
  refreshing = refreshing || doRefresh().finally(() => { refreshing = null; });
  return refreshing;
}

async function doRefresh() {
  const { refreshToken } = await getSession();
  if (!refreshToken) return null;
  const base = await getApiBaseUrl();
  const res = await netFetch(`${base}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json", "x-client": "extension" }, body: JSON.stringify({ refreshToken }) });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.accessToken && data.refreshToken) {
    await sessionStore().set({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
    return data.accessToken;
  }
  // Only a definitive rejection ends the session. A 429/5xx/outage must NOT
  // sign the user out — they can simply retry.
  if (res.ok || [400, 401, 403].includes(res.status)) { await clearSession(); return null; }
  throw await apiError(res, SERVER_MESSAGE);
}

async function getToken() {
  const { accessToken } = await getSession();
  return accessToken || refreshSession();
}

async function authorizedFetch(path, options = {}) {
  const base = await getApiBaseUrl();
  let token = await getToken();
  if (!token) throw new TTError("Not logged in or session ended. Sign in again.", { code: "session_expired" });
  const request = (value) => netFetch(`${base}${path}`, { ...options, headers: { "x-client": "extension", token: value, ...(options.headers || {}) } });
  let res = await request(token);
  if (res.status !== 401) return res;
  token = await refreshSession();
  if (!token) throw new TTError("Your session has ended. Sign in again.", { code: "session_expired" });
  // Never automatically repeat a mutation. POST /jobs is idempotent server-side,
  // but resume/apply endpoints are not assumed safe to replay.
  if (!["GET", "HEAD", "OPTIONS"].includes((options.method || "GET").toUpperCase())) {
    throw new TTError("Your session was restored. Please repeat that action.", { code: "session_restored" });
  }
  return request(token);
}

// One place that performs an authorized call and returns parsed JSON or throws
// a coded TTError — replaces the per-endpoint copies of this logic.
async function apiJson(path, options, fallback) {
  const res = await authorizedFetch(path, options);
  if (!res.ok) throw await apiError(res, fallback);
  return res.json().catch(() => ({}));
}

async function register(name, email, password) {
  const base = await getApiBaseUrl();
  const res = await netFetch(`${base}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  if (!res.ok) throw await apiError(res, "Registration failed");
  return res.json().catch(() => ({}));
}

async function login(email, password) {
  const base = await getApiBaseUrl();
  const res = await netFetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-client": "extension" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw await apiError(res, "Login failed");
  const data = await res.json().catch(() => ({}));
  if (!data.accessToken || !data.refreshToken) throw new TTError("The server did not create a secure session.", { code: "server_error" });
  await sessionStore().set({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
  return data.user;
}

async function logout() {
  const { refreshToken } = await getSession();
  try {
    if (refreshToken) {
      const base = await getApiBaseUrl();
      await netFetch(`${base}/auth/logout`, { method: "POST", headers: { "Content-Type": "application/json", "x-client": "extension" }, body: JSON.stringify({ refreshToken }) });
    }
  } catch (e) {
    // offline logout still ends the local session below
  } finally { await clearSession(); }
}

const JSON_HEADERS = { "Content-Type": "application/json" };

async function saveJob(job) {
  // `job` is passed through as-is from content.js/popup — the backend's
  // POST /api/jobs is the single source of truth for which fields matter and
  // how dedup works, so we don't reshape it here.
  return apiJson("/jobs", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(job) }, "Failed to save job");
}

// Marks an already-saved job (by TrackedJob id) as Applied. Reuses the
// existing PUT /api/jobs/:id update path.
async function markApplied(id) {
  return updateJob(id, { status: "Applied" });
}

// Concurrent callers (popup list + "already tracked?" lookup) share one request.
let jobsInFlight = null;
function getJobs() {
  jobsInFlight = jobsInFlight || apiJson("/jobs", { method: "GET" }, "Failed to load jobs").finally(() => { jobsInFlight = null; });
  return jobsInFlight;
}

async function updateJob(id, updates) {
  if (!id) throw new TTError("Missing job id.", { code: "validation" });
  return apiJson(`/jobs/${id}`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(updates) }, "Failed to update job");
}

async function deleteJob(id) {
  if (!id) throw new TTError("Missing job id.", { code: "validation" });
  const res = await authorizedFetch(`/jobs/${id}`, { method: "DELETE" });
  if (!res.ok) throw await apiError(res, "Failed to delete job");
  return true;
}

// Is the job on the current page already tracked? Matches by the site's own job
// id (or the canonical URL the extractor produced) — never by title/company
// guesses, so a "tracked" badge is never wrong.
function findTracked(jobs, sj) {
  if (!Array.isArray(jobs) || !sj) return null;
  const hit = jobs.find((j) =>
    (sj.externalJobId && j.externalJobId === sj.externalJobId && (!j.sourceName || !sj.sourceName || j.sourceName === sj.sourceName)) ||
    (sj.sourceUrl && j.sourceUrl && j.sourceUrl === sj.sourceUrl));
  return hit ? { id: hit.id, status: hit.status || "Applied" } : null;
}
async function lookupTracked(sj) {
  try { return findTracked(await getJobs(), sj); } catch (e) { return null; } // best effort: never blocks detection
}

// Pages the content script is declared for (keep in sync with manifest.json).
const SUPPORTED_PAGE = /^https:\/\/([a-z0-9-]+\.)*(linkedin\.com\/jobs\/|indeed\.com\/)/i;

// ---- Resume Tailoring --------------------------------------------------
// The extension holds NO tailoring/AI logic and NO AI credentials: it forwards
// the extracted job to the authenticated backend (/api/resume/*) and returns
// whatever the API says. Machine-readable error codes (e.g. "no_resume") are
// passed through so the panel can show the right call to action.
async function resumeApi(path, { method = "GET", body } = {}) {
  return apiJson(`/resume${path}`, { method, headers: JSON_HEADERS, body: body === undefined ? undefined : JSON.stringify(body) }, "Resume request failed");
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
          const { accessToken, refreshToken } = await getSession();
          const hadSession = Boolean(accessToken || refreshToken);
          try {
            if (!(await getToken())) { sendResponse({ ok: true, loggedIn: false, user: null, expired: hadSession }); break; }
            const res = await authorizedFetch("/auth/me", { method: "GET" });
            if (res.status === 401 || res.status === 403) { await clearSession(); sendResponse({ ok: true, loggedIn: false, user: null, expired: true }); break; }
            if (!res.ok) throw await apiError(res, SERVER_MESSAGE);
            const data = await res.json().catch(() => ({}));
            await sessionStore().set({ user: data.user });
            sendResponse({ ok: true, loggedIn: true, user: data.user });
          } catch (err) {
            // Ended session => logged out (with a reason). Offline / server
            // trouble => report the error but KEEP the session, so a network
            // blip never looks like a sign-out.
            if (err.code === "session_expired") { sendResponse({ ok: true, loggedIn: false, user: null, expired: true }); break; }
            throw err;
          }
          break;
        }
        case "API_REQUEST": {
          // Generic authorized proxy for the extension's own pages (dashboard).
          // Content scripts run inside third-party pages, so they never get it.
          if (sender?.tab || typeof message.path !== "string" || !message.path.startsWith("/")) {
            sendResponse({ ok: false, error: "Request not allowed.", code: "forbidden" });
            break;
          }
          const data = await apiJson(message.path, message.options || {}, "Request failed");
          sendResponse({ ok: true, data });
          break;
        }
        case "REFRESH_SESSION": {
          // Lets extension pages that call the API directly (resume upload/
          // download need FormData/Blob, which can't cross messaging) reuse the
          // one rotating-session refresh instead of implementing their own.
          const token = await refreshSession();
          sendResponse(token ? { ok: true } : { ok: false, error: "Your session has ended. Sign in again.", code: "session_expired" });
          break;
        }
        case "OPEN_PANEL": {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          try {
            await chrome.tabs.sendMessage(tab.id, { type: "TT_OPEN_PANEL" });
            sendResponse({ ok: true });
          } catch (e) {
            sendResponse({ ok: false, error: "Reload this job page, then try again.", code: "not_ready" });
          }
          break;
        }
        case "OPEN_DASHBOARD": {
          await chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html#applicationsTab") });
          sendResponse({ ok: true });
          break;
        }
        case "CHECK_JOB_TRACKED": {
          sendResponse({ ok: true, tracked: await lookupTracked(message.job) });
          break;
        }
        case "GET_DETECTED_JOB": {
          // Ask the active tab's content script (jd-extract.js + content.js)
          // what it can see. `activeTab` (granted when the popup opens) lets us
          // read the tab URL to tell "not a job site" apart from "job site, but
          // the page needs a reload before the content script is listening".
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) {
            sendResponse({ ok: true, supported: false, found: false });
            break;
          }
          try {
            const reply = await chrome.tabs.sendMessage(tab.id, { type: "TT_GET_DETECTED_JOB" });
            const found = Boolean(reply?.found);
            sendResponse({ ok: true, supported: true, found, job: reply?.job || null, saveJob: reply?.saveJob || null, tracked: found ? await lookupTracked(reply.saveJob) : null });
          } catch (e) {
            const onJobSite = SUPPORTED_PAGE.test(tab.url || "");
            sendResponse({ ok: true, supported: onJobSite, found: false, reason: onJobSite ? "not_ready" : "unsupported" });
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
      // Only our own coded errors carry user-safe text; anything unexpected is
      // reported generically (never a raw message or stack).
      const known = err instanceof TTError;
      const response = { ok: false, error: known ? err.message : GENERIC_MESSAGE, code: known ? err.code : null };
      if (known && err.retryAfterSeconds) response.retryAfterSeconds = err.retryAfterSeconds;
      sendResponse(response);
    }
  })();

  // Keep the message channel open for the async response above.
  return true;
});
