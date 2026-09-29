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
  return typeof url === "string" && url.length <= 500 && /^(tracktrail:\/\/|mobile:\/\/|exp:\/\/)/.test(url);
}

// ---------------------------------------------------------------------------
// Password-reset redirects are STRICTER than the Gmail one above, because the
// reset token itself is appended to whatever URL is accepted here. Accepting
// "any exp:// URL" would let a caller ask for a genuine TrackTrail reset email
// whose link hands the token to a host of the caller's choosing
// (e.g. exp://attacker.example:8081/...). So:
//   - production/standalone build: exactly `mobile://reset-password`
//     (no host/path/query/credentials of the caller's choosing);
//   - Expo Go (development only, never in production): exactly
//     `exp://<loopback|private-LAN host>[:port]/--/reset-password`.
// ---------------------------------------------------------------------------
function isPrivateOrLoopbackHost(host) {
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([m[1], m[2], m[3], m[4]].some((o) => Number(o) > 255)) return false;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function isAllowedResetRedirect(url, env = process.env) {
  if (typeof url !== "string" || url.length > 200) return false;
  // `tracktrail://` is the production scheme; `mobile://` is kept so builds
  // shipped before the rename can still complete a reset.
  if (/^(?:tracktrail|mobile):\/\/reset-password\/?$/.test(url)) return true;
  if (env.NODE_ENV === "production" && env.ALLOW_EXPO_GO_RESET_REDIRECT !== "true") return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return (
    u.protocol === "exp:" &&
    !u.username &&
    !u.password &&
    !u.search &&
    !u.hash &&
    u.pathname === "/--/reset-password" &&
    isPrivateOrLoopbackHost(u.hostname)
  );
}

module.exports = { isAllowedMobileRedirect, isAllowedResetRedirect };
