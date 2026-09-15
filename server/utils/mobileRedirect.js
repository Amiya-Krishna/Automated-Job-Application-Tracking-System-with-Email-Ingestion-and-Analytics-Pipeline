// Shared validator for a mobile client's self-reported redirect
// destination — used anywhere a request can legitimately come from the
// mobile app and needs the server to hand back a `mobile://` (standalone/
// dev-client build) or `exp://` (Expo Go, host/port differs per machine)
// deep link. Centralized here rather than duplicated per route, first
// introduced for Gmail OAuth's auth-url/callback (server/routes/gmailRoutes.js)
// and reused as-is for password reset's forgot-password (server/routes/authRoutes.js)
// — same trust model, same two schemes, no reason for two copies of the
// same regex to drift apart.
//
// This only constrains the *scheme* a redirect may use; it deliberately
// does not — and cannot — verify the URL actually belongs to this
// project's own mobile app. That's fine for what it's used for: the
// worst case of a forged redirectUri is the OS being asked to open some
// other `mobile://`/`exp://`-scheme app with a short-lived, single-use
// token in the query string, not an arbitrary open redirect to a
// attacker-controlled domain (https/http are not in the allow-list).
function isAllowedMobileRedirect(url) {
  return typeof url === "string" && /^(mobile:\/\/|exp:\/\/)/.test(url);
}

module.exports = { isAllowedMobileRedirect };
