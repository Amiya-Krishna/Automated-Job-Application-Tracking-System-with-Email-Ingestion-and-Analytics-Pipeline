// Where may a Gmail OAuth flow send the user back to?
//
// The callback runs in a fresh top-level browser navigation (Google -> API), with
// no cookies or headers identifying the TrackTrail client. So the only trustworthy
// carrier of "who started this and where to go back" is the SIGNED `state` JWT the
// server itself issued at /gmail/auth-url. This module validates every value that
// goes INTO that state (at start) and re-validates it when it comes OUT (callback),
// so a return target is never taken from a request on trust:
//
//   web        -> an origin from the CLIENT_URL allow-list + a same-origin PATH
//   extension  -> a page on this API server (never a chrome-extension:// URL,
//                 which Chrome blocks when a web page redirects to it)
//   mobile     -> exactly this app's `gmail-callback` deep link
//
// Anything else falls back to a safe default; nothing here ever returns a URL the
// caller chose freely.
const { isAllowedResetRedirect } = require("./mobileRedirect");

function parseClientOrigins(raw = process.env.CLIENT_URL) {
  const out = [];
  for (const item of String(raw || "").split(",")) {
    const value = item.trim().replace(/\/+$/, "");
    if (!value) continue;
    try {
      const u = new URL(value);
      if (u.protocol === "http:" || u.protocol === "https:") out.push(u.origin);
    } catch {
      /* ignore malformed entry */
    }
  }
  return out;
}

// The web origin to return to: the browser-supplied Origin header of the
// /auth-url XHR (CORS already limits it to the allow-list, re-checked here), else
// the first configured origin.
function resolveWebReturnOrigin(requestOrigin, allowed = parseClientOrigins()) {
  if (typeof requestOrigin === "string" && allowed.includes(requestOrigin)) return requestOrigin;
  return allowed[0] || null;
}

// A same-origin path (+ query) only. Rejects absolute URLs, protocol-relative
// `//host`, backslash tricks, control characters and anything that does not
// resolve to the same host. The fragment is dropped.
function sanitizeReturnPath(input, fallback = "/integrations") {
  if (typeof input !== "string" || !input || input.length > 300) return fallback;
  if (!input.startsWith("/") || input.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(input)) return fallback;
  let u;
  try {
    u = new URL(input, "http://return.invalid");
  } catch {
    return fallback;
  }
  if (u.host !== "return.invalid" || u.protocol !== "http:") return fallback;
  // The result flag is added by the callback; never carry a stale one forward.
  u.searchParams.delete("gmail");
  const out = `${u.pathname}${u.search}`;
  // Dot-segments can collapse into a protocol-relative path ("/a/..//evil.test" -> "//evil.test").
  if (out.startsWith("//")) return fallback;
  return out;
}

function withParam(url, key, value) {
  const u = new URL(url);
  u.searchParams.set(key, value);
  return u.toString();
}

// Mobile: exactly this app's `gmail-callback` deep link. Production builds use
// `tracktrail://gmail-callback` (or the legacy `mobile://`); Expo Go's per-machine
// `exp://<private-lan-host>[:port]/--/gmail-callback` is development only (same
// switch password reset uses). No credentials, host, path or fragment of the
// caller's choosing; a query is not accepted either.
function isAllowedGmailRedirect(url, env = process.env) {
  if (typeof url !== "string" || url.length > 200) return false;
  if (/^(?:tracktrail|mobile):\/\/gmail-callback\/?$/.test(url)) return true;
  // Expo Go: reuse the reset-redirect host rules by swapping only the final path.
  if (!/\/--\/gmail-callback$/.test(url)) return false;
  return isAllowedResetRedirect(url.replace(/gmail-callback$/, "reset-password"), env);
}

// The browser extension uses chrome.identity.launchWebAuthFlow(). Google still
// redirects to the server callback (GOOGLE_REDIRECT_URI), and the server then
// redirects to Chrome's identity callback (https://<extension-id>.chromiumapp.org/...).
// This value MUST be explicitly configured so an authenticated caller cannot
// choose an arbitrary chromiumapp.org destination.
function extensionOAuthRedirectUrl(env = process.env) {
  const configured = env.EXTENSION_OAUTH_REDIRECT_URI || env.EXTENSION_REDIRECT_URL;
  if (!configured) return null;
  try {
    const u = new URL(configured);
    if (u.protocol !== "https:" || !/^[a-z0-9-]+\.chromiumapp\.org$/i.test(u.hostname)) return null;
    if (u.username || u.password || u.search || u.hash) return null;
    return u.toString();
  } catch {
    return null;
  }
}

// Legacy helper retained for deployments/tests that still serve the old landing
// page. New extension OAuth must use extensionOAuthRedirectUrl().
function extensionLandingUrl(env = process.env) {
  const configured = env.EXTENSION_REDIRECT_URL;
  if (configured) {
    try {
      const u = new URL(configured);
      if (u.protocol === "https:" || u.protocol === "http:") return u.toString();
    } catch {
      /* fall through */
    }
  }
  let base = env.SERVER_URL;
  if (!base && env.GOOGLE_REDIRECT_URI) {
    try { base = new URL(env.GOOGLE_REDIRECT_URI).origin; } catch { /* fall through */ }
  }
  base = (base || `http://localhost:${env.PORT || 5000}`).replace(/\/+$/, "");
  return `${base}/extension/gmail-success.html`;
}

module.exports = {
  parseClientOrigins,
  resolveWebReturnOrigin,
  sanitizeReturnPath,
  withParam,
  isAllowedGmailRedirect,
  extensionLandingUrl,
  extensionOAuthRedirectUrl,
};
