import { DEFAULT_API_BASE_URL } from "./config.js";

async function getApiBaseUrl() {
  const { apiBaseUrl } = await chrome.storage.local.get("apiBaseUrl");
  return (apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

async function getToken() {
  const { token } = await chrome.storage.local.get("token");
  return token || null;
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
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
          sendResponse({ ok: true, job });
          break;
        }
        case "GET_JOBS": {
          const jobs = await getJobs();
          sendResponse({ ok: true, jobs });
          break;
        }
        default:
          sendResponse({ ok: false, error: "Unknown message type" });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();

  // Keep the message channel open for the async response above.
  return true;
});
