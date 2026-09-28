# Implementation Summary

Scope note: inspection showed earlier work had already made much of the app mobile-friendly
(responsive Navbar with hamburger menu, card-based Matched/Engine pages, a full mobile
dashboard, source-aware web/mobile password reset). This pass targeted the real remaining gaps
rather than rewriting working code.

## Web (client)
- Dashboard, Applied Jobs, Companies: desktop tables kept; below the breakpoint they render as
  card lists (no horizontal scroll, 40-44px touch targets). Filter bars stack on phones.
- NotificationBell: dropdown was a fixed 320px `right-0` panel that overflowed narrow screens
  (now a viewport-inset panel on mobile); the delete button was hover-only (unreachable on touch).
- Fixed Linux/CI build breakers: files were saved as `Notificationcontext.jsx`,
  `Notificationbell.jsx`, `notificationevents.js` but imported with different casing.
  Renamed to match imports.
- Removed unused scaffold `components/JobTable.jsx` and `components/Sidebar.jsx` (no references).
- Forgot/Reset Password pages read `?source=extension` (branding, copy, post-reset screen).

## Mobile
- Profile: identity card with avatar, **Edit profile** and **Settings** directly on Profile,
  "Connected" rows (Gmail Integration with live status, My Resumes), skills.
- Settings: **Edit profile and Change password removed.** Sections: Account (+Gmail shortcut),
  Preferences (appearance, notification toggles - existing, persisted), Support (About, Privacy,
  Terms), Log out. No delete-account (backend has no endpoint) and no invented settings.
- New dedicated **Gmail Integration** screen (`app/account/gmail.tsx`), reusing the existing
  hooks/backend: status, connect, disconnect, scan, add-to-pipeline, loading/error/empty states.
- Home: added "Paste JD" (`/tailor`) and "Gmail" quick actions; Gmail card opens the new screen.
- Removed the orphaned top-level `app/(tabs)` route group (never registered in the root Stack).

## Browser extension
- Popup detects a job on the active tab (new `GET_DETECTED_JOB` -> content-script
  `TT_GET_DETECTED_JOB`, same extractor as the on-page button) and offers one-tap "Add job",
  with saved / already-added / retry states and honest hints when nothing is detected.
  Added the minimal `activeTab` permission.
- "Forgot password" opens the web page with `?source=extension`.

## Password reset architecture (source-aware)
| Origin | Request | Emailed link |
|---|---|---|
| web | no `source` | `<first CLIENT_URL>/reset-password?token=...` |
| mobile | `source=mobile` + `redirectUri` | that deep link (`mobile://` or `exp://` only) + `?token=` |
| extension | `source=extension` | web reset page + `&source=extension` |

- Mobile: `"scheme": "mobile"` is registered in `mobile/app.json`; the app's
  `(auth)/reset-password` screen consumes the token.
- Extension: an email link cannot reliably open an extension page - the extension has no
  configured stable ID (no `key` in the manifest), so a `chrome-extension://` URL would be
  invented. Instead the trusted web page is reused as the intermediate step and shows extension
  branding and a "return to the extension and sign in" screen. This is a limitation: the user
  finishes the reset in a browser tab, then signs in from the extension manually.
- Security: client-supplied redirects are never trusted (mobile is scheme allow-listed; extension
  ignores any `redirectUri`); tokens are 30-minute, purpose-scoped JWTs and are now
  **single-use** - a fingerprint of the current password hash is embedded and checked, so a
  token dies once the password changes (no schema change); same generic response for unknown
  emails; tokens are not logged.

## Tests run
- Client: `vite build` OK; vitest 16/16.
- Extension: 47/47.
- Server: new `tests/auth/passwordResetRouting.test.js` (8/8) drives the real router over HTTP with
  stubbed Prisma/email and checks the generated URL for web, mobile (mobile:// and exp://) and
  extension, rejection of bad redirects, expiry, wrong-purpose tokens, and replay. Real email
  delivery was NOT tested (no SMTP/DB in the sandbox).
- Mobile: `tsc --noEmit` clean; integration tests 25/27.
- Not done: no simulator/device run, no browser-based viewport testing at 320-414px, and the
  extension popup was not exercised in a real browser (logic covered by unit tests only).

## Known pre-existing failures (not caused by these changes)
1. Server security test "AI provider hosts ... ONLY inside providers" fails when a real
   `server/.env` is present; it passes without it. `.env` is excluded from the ZIP.
2. Server security test "mobile networking goes only through the shared API client" expects
   `from '@/services/api'` in `mobile/services/resume.ts` (stale assertion).
3. Mobile test 3: `expo-sharing ~57.0.21` vs SDK-expected `~57.0.22`.
4. Mobile test 10: regex expectation on `use-tailoring` hook source no longer matches.
5. `npm run lint` (client) reports react-hooks rule errors in untouched files.

## Other limitations
- Web pages not converted to cards: none found with desktop-only tables remaining, but pages
  such as JobForm/Analytics/ResumeTailoring were only scanned for fixed widths, not visually tested.
- The extension's internal full-page dashboard was not redesigned.

---

# Final QA pass (this update)

A full independent QA/verification pass was run against the ZIP produced by the work above —
real dependency installs, a real PostgreSQL database, a real running server, and real Chromium
driving the web app, the mobile app (exported for web), and the unpacked extension. Full
detail, evidence, and the complete pass/fail matrix are in `FINAL_QA_REPORT.md`. Summary of
what changed as a result:

## Bugs found and fixed in this pass
- **Password-reset redirect hijack (High):** `source=mobile` accepted any `exp://` host as
  `redirectUri`, so a crafted request could get a real reset token emailed to an
  attacker-controlled `exp://` endpoint. `server/utils/mobileRedirect.js` now has a dedicated
  `isAllowedResetRedirect()` — only `mobile://reset-password`, or `exp://<private/loopback
  host>/--/reset-password` in development only. The Gmail OAuth redirect validator is
  unchanged/separate.
- **HTML injection in the reset email (Medium):** `resetUrl` is now escaped before being put
  in the email's `<a href>`; a plain-text part was also added.
- **Reset token logged in production (Medium):** the dev-only fallback that logs the reset
  link (used when no `RESEND_API_KEY` is set) is now gated on `NODE_ENV !== "production"`.
- **Browser extension failed to load entirely (High):** `manifest.json` referenced an
  `icons/` folder that didn't exist in the project; confirmed with a real Chromium launch
  (no service worker registered = extension doesn't load). Generated `icon16/48/128.png`
  from the existing TrackTrail brand mark and wired up `action.default_icon`.
- **Web Dashboard overflowed horizontally at every phone width (High):** the two-column grid
  had no single-column fallback and the table card had no `min-w-0`. Fixed in
  `client/src/pages/Dashboard.jsx`.
- **Desktop nav overflowed from ~640px to ~1080px (Medium):** the hamburger/desktop-nav
  breakpoint was `sm` (640px) but the desktop nav needs ~1080px; moved to `xl` (1280px) in
  `client/src/components/Navbar.jsx`.
- **Mobile reset-password screen unreachable when already signed in (Medium):** it lived
  inside the `(auth)` route group, which is guarded to signed-out users only. Moved to
  `app/reset-password.tsx`, outside both `Stack.Protected` branches.
- **Mobile Home "Upload resume" opened Edit Profile instead of Resumes (Low):** fixed the
  route in `app/(drawer)/(tabs)/index.tsx`.
- **Mobile Profile had no Log out control (Low, explicitly required by the QA brief):** added
  one, reusing the existing `useAuth().logout()` and the same styling as the one in Settings.
- Two test assertions were stale (quote-style regexes), not the code they tested — widened the
  regexes rather than touching working source. `expo-sharing`'s declared version range was
  corrected to match what's already resolved in the lockfile.

## Test results after this pass
Server 160/160 (was 153/155) · Client 16/16 + build clean · Extension 47/47 + now actually
loads in a real browser · Mobile `tsc` clean, integration tests 27/27 (was 25/27) · Web
responsive sweep: 190 page/width combinations checked in real Chromium, overflow fixed at
every one except a test-harness artifact (not a real app defect) · Web password reset: 21/21
checks in a real browser · Mobile password reset (app routing/logic, via a web export of the
real route tree, including cold start and signed-in-already cases): 14/14 · Reset-token
security (tampering, replay, expiry, `alg:none`, wrong-purpose JWT, redirect-hijack
attempts): all verified live against the running server, all correctly rejected.

## What is still not verified (see `FINAL_QA_REPORT.md` §7/§11 for full detail)
- **Native mobile deep links** (`exp://`/`mobile://` OS-level handoff, Expo Go vs. dev vs.
  release build, cold/background/killed-process launches) — no Android/iOS device or emulator
  is available in this environment. This is the largest open item against the original brief.
- The mobile Android/iOS **native bundle build** was last verified before the three mobile
  fixes above (reset-route move, Upload-resume fix, Profile Log out) — `tsc` and the full
  mobile test suite are clean after those changes, but the bundle step itself needs one more
  run.
- **Redis-backed queue behavior** (engine job ingestion, matching, scraping) — no Redis
  instance available; one related symptom (a slow "Saving…" state on the extension's job
  capture) is flagged but not confirmed to be caused by this.
- **Real Gmail OAuth** — only the disconnected/error UI and a simulated (not real-token)
  connected UI were checked.
- **Extension-native password reset** was not built — it still ends on a web page in a
  browser tab, same as before this pass. The `.env.example`'s existing
  `EXTENSION_REDIRECT_URL=chrome-extension://<id>/...` pattern (already used for Gmail)
  shows a workable direction (a pinned manifest `key` + an https bounce page), but building it
  is a real architecture change and was not attempted.
- 6 pre-existing client lint errors (tool/rule-version drift, not a regression from this or
  the prior pass) were left as-is.
- Several pre-existing, non-blocking issues were found and are listed with severity in
  `FINAL_QA_REPORT.md` §10 (login account-enumeration, no rate limiting on auth endpoints,
  a possibly-missing session invalidation on password reset, a missing `db/schema.sql`,
  mobile reset-screen copy that doesn't match the email, and a docs/code mismatch in the
  extension's `config.js`) — none of these were fixed in this pass, to stay within its scope.
