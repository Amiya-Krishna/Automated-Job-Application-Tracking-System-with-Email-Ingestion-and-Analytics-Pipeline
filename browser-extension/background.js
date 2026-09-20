import { DEFAULT_API_BASE_URL, DEFAULT_WEB_APP_URL } from "./config.js";

async function getApiBaseUrl() {
  const { apiBaseUrl } = await chrome.storage.local.get("apiBaseUrl");
  return (apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

async function getWebAppUrl() {
  const { webAppUrl } = await chrome.storage.local.get("webAppUrl");
  return (webAppUrl || DEFAULT_WEB_APP_URL).replace(/\/+$/, "");
}

async function getToken() {
  const { token } = await chrome.storage.local.get("token");
  return token || null;
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Login failed");
  }

  await chrome.storage.local.set({ token: data.token, user: data.user });
  return data.user;
}

async function logout() {
  await chrome.storage.local.remove(["token", "user"]);
}

async function saveJob(job) {
  const base = await getApiBaseUrl();
  const token = await getToken();

  if (!token) {
    throw new Error("Not logged in. Open the extension and sign in first.");
  }

  // `job` is passed through as-is from content.js (company, role, status,
  // notes, location, description, sourceName, sourceUrl, externalJobId) —
  // the backend's POST /api/jobs is the single source of truth for which
  // fields matter and how dedup works, so we don't reshape it here.
  const res = await fetch(`${base}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token,
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
  const base = await getApiBaseUrl();
  const token = await getToken();

  if (!token) {
    throw new Error("Not logged in. Open the extension and sign in first.");
  }

  const res = await fetch(`${base}/jobs`, {
    method: "GET",
    headers: { token },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Failed to load jobs");
  }

  return data;
}

async function updateJob(id, updates) {
  const base = await getApiBaseUrl();
  const token = await getToken();

  if (!token) {
    throw new Error("Not logged in. Open the extension and sign in first.");
  }
  if (!id) {
    throw new Error("Missing job id.");
  }

  const res = await fetch(`${base}/jobs/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      token,
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
  const base = await getApiBaseUrl();
  const token = await getToken();

  if (!token) {
    throw new Error("Not logged in. Open the extension and sign in first.");
  }
  if (!id) {
    throw new Error("Missing job id.");
  }

  const res = await fetch(`${base}/jobs/${id}`, {
    method: "DELETE",
    headers: { token },
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
  const base = await getApiBaseUrl();
  const token = await getToken();

  if (!token) {
    const err = new Error("Not logged in. Open the extension and sign in first.");
    err.code = "not_logged_in";
    throw err;
  }

  const res = await fetch(`${base}/resume${path}`, {
    method,
    headers: { "Content-Type": "application/json", token },
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
          const [{ token }, { user }] = await Promise.all([
            chrome.storage.local.get("token"),
            chrome.storage.local.get("user"),
          ]);
          sendResponse({ ok: true, loggedIn: Boolean(token), user: user || null });
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
        case "RESUME_ANALYZE": {
          const analysis = await resumeApi("/analyze", { method: "POST", body: { job: message.job } });
          sendResponse({ ok: true, analysis });
          break;
        }
        case "RESUME_TAILOR": {
          const session = await resumeApi("/tailor", { method: "POST", body: { job: message.job } });
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
      sendResponse({ ok: false, error: err.message, code: err.code || null });
    }
  })();

  // Keep the message channel open for the async response above.
  return true;
});
