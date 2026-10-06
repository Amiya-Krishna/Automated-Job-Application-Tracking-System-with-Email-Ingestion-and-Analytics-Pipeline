// Shared error classification for every TrackTrail extension surface (popup,
// dashboard, on-page panel/dock). Classic script (no module syntax) so it can be
// loaded by <script> tags AND listed in manifest content_scripts.
//
// The background worker already returns user-safe text + a machine-readable
// `code` (see background.js). This only decides how a surface should PRESENT it:
//   kind: "session" | "session-restored" | "offline" | "rate-limited" | "server" | "validation" | "error"
//   retryable: whether a Retry button makes sense
// It never inspects or shows raw errors — unknown failures get the fallback text.
(function (root) {
  "use strict";

  const NO_RETRY_CODES = new Set([
    "no_resume", "resume_unreadable", "jd_too_short", "validation", "forbidden",
    "no_matching_skills", "context_invalidated", "not_logged_in",
  ]);

  function describe(result, fallback) {
    const text = "Something went wrong. Please try again.";
    const code = (result && result.code) || null;
    const raw = String((result && result.error) || "");
    const base = { message: raw || fallback || text, retryable: true, retryAfterSeconds: null };

    if (code === "account_blocked") {
      return { ...base, kind: "session", retryable: false, message: raw || "Your account has been blocked. Please contact an administrator." };
    }
    if (code === "session_expired" || code === "not_logged_in" || /not logged in|session (has )?(ended|expired)/i.test(raw)) {
      return { ...base, kind: "session", retryable: false, message: raw || "Your session ended. Sign in again." };
    }
    if (code === "session_restored") return { ...base, kind: "session-restored" };
    if (code === "network" || (typeof navigator !== "undefined" && navigator.onLine === false)) {
      return { ...base, kind: "offline", message: "You appear to be offline or TrackTrail can't be reached. Check your connection and try again." };
    }
    if (code === "rate_limited") {
      const secs = Number(result.retryAfterSeconds);
      const wait = Number.isFinite(secs) && secs > 0 ? Math.ceil(secs) : null;
      return { ...base, kind: "rate-limited", retryAfterSeconds: wait, message: wait ? `Too many requests. Please wait ${wait} second${wait === 1 ? "" : "s"} and try again.` : "Too many requests. Please wait a moment and try again." };
    }
    if (code === "server_error") return { ...base, kind: "server" };
    if (code === "validation") return { ...base, kind: "validation", retryable: false };
    return { ...base, kind: NO_RETRY_CODES.has(code) ? "validation" : "error", retryable: !NO_RETRY_CODES.has(code) };
  }

  root.TrackTrailErrors = { describe };
})(typeof globalThis !== "undefined" ? globalThis : this);
