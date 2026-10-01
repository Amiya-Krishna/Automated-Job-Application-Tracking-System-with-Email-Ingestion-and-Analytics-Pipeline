// Access tokens normally live only in memory. The durable credential is
// the HttpOnly refresh cookie issued by the API, so XSS cannot read a normal
// session credential from localStorage.
//
// OAuth exception: Google OAuth is a top-level navigation in the SAME browser
// tab. That unloads the React app and therefore clears the in-memory access
// token. We temporarily preserve the existing short-lived access token in
// sessionStorage immediately before that navigation. sessionStorage is scoped
// to the current browser tab and is cleared when the tab is closed. The value
// is consumed and deleted on the first application restore after OAuth.
let accessToken = null;

const OAUTH_HANDOFF_KEY = "tracktrail:oauth-access-token";
const OAUTH_HANDOFF_TTL_MS = 10 * 60 * 1000;

export const getAccessToken = () => accessToken;

export const setAccessToken = (token) => {
  accessToken = typeof token === "string" && token ? token : null;
};

export const clearAccessToken = () => {
  accessToken = null;
};

export const preserveAccessTokenForOAuth = () => {
  if (!accessToken || typeof window === "undefined") return false;

  try {
    window.sessionStorage.setItem(
      OAUTH_HANDOFF_KEY,
      JSON.stringify({ token: accessToken, createdAt: Date.now() })
    );
    return true;
  } catch {
    return false;
  }
};

export const restoreAccessTokenAfterOAuth = () => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(OAUTH_HANDOFF_KEY);
    // Always consume the handoff. It is a one-time bridge, not durable auth
    // storage.
    window.sessionStorage.removeItem(OAUTH_HANDOFF_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.token !== "string" ||
      !parsed.token ||
      !Number.isFinite(parsed.createdAt) ||
      Date.now() - parsed.createdAt > OAUTH_HANDOFF_TTL_MS
    ) {
      return null;
    }

    accessToken = parsed.token;
    return accessToken;
  } catch {
    try {
      window.sessionStorage.removeItem(OAUTH_HANDOFF_KEY);
    } catch {
      // Ignore storage failures; normal refresh-cookie restoration can still run.
    }
    return null;
  }
};

export const clearOAuthAccessTokenHandoff = () => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(OAUTH_HANDOFF_KEY);
  } catch {
    // Ignore storage failures.
  }
};
