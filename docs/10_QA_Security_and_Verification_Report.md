# QA, Security & Verification Report

> **Consolidated from:** `IMPLEMENTATION_SUMMARY.md` (implementation-pass scope, password-reset architecture, tests, pre-existing failures, limitations) and `FINAL_QA_REPORT.md` (independent QA pass).
> The "Final QA pass (this update)" section at the end of `IMPLEMENTATION_SUMMARY.md` summarised the same fixes, test results and open items that are recorded in full in Part B (§3, §4, §7, §10, §11, §12), so it is not repeated here.

---

## Part A — Implementation Pass

### A1. Scope

Scope note: inspection showed earlier work had already made much of the app mobile-friendly
(responsive Navbar with hamburger menu, card-based Matched/Engine pages, a full mobile
dashboard, source-aware web/mobile password reset). This pass targeted the real remaining gaps
rather than rewriting working code.

### A2. Password-reset architecture (source-aware)

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

### A3. Tests run (implementation pass)

- Client: `vite build` OK; vitest 16/16.
- Extension: 47/47.
- Server: new `tests/auth/passwordResetRouting.test.js` (8/8) drives the real router over HTTP with
  stubbed Prisma/email and checks the generated URL for web, mobile (mobile:// and exp://) and
  extension, rejection of bad redirects, expiry, wrong-purpose tokens, and replay. Real email
  delivery was NOT tested (no SMTP/DB in the sandbox).
- Mobile: `tsc --noEmit` clean; integration tests 25/27.
- Not done: no simulator/device run, no browser-based viewport testing at 320-414px, and the
  extension popup was not exercised in a real browser (logic covered by unit tests only).

### A4. Known pre-existing failures (at the end of the implementation pass)

1. Server security test "AI provider hosts ... ONLY inside providers" fails when a real
   `server/.env` is present; it passes without it. `.env` is excluded from the ZIP.
2. Server security test "mobile networking goes only through the shared API client" expects
   `from '@/services/api'` in `mobile/services/resume.ts` (stale assertion).
3. Mobile test 3: `expo-sharing ~57.0.21` vs SDK-expected `~57.0.22`.
4. Mobile test 10: regex expectation on `use-tailoring` hook source no longer matches.
5. `npm run lint` (client) reports react-hooks rule errors in untouched files.

See Part B (§4 and §6) for how the final QA pass handled the test failures.

### A5. Other limitations

- Web pages not converted to cards: none found with desktop-only tables remaining, but pages
  such as JobForm/Analytics/ResumeTailoring were only scanned for fixed widths, not visually tested.
- The extension's internal full-page dashboard was not redesigned.

---

## Part B — Final QA Report

This is an independent re-verification pass over the ZIP delivered after the previous
implementation phase. Nothing here was assumed from that phase's own numbers — every result
below was reproduced in this sandbox: real dependency installs, a real PostgreSQL database
(via an embedded binary, since the network policy blocks Prisma's engine CDN), a real HTTP
server, and real Chromium (Playwright) driving the web app, the mobile app's web export, and
the unpacked browser extension.

Status legend: **PASS** / **FAIL** / **PARTIAL** / **BLOCKED** / **PRE-EXISTING** /
**ENVIRONMENT ISSUE**.

---

### 1. Environment

| Component | What was used |
|---|---|
| Node | v22 (project's own toolchain) |
| Database | PostgreSQL, run from the `embedded-postgres` npm package (real `postgres`/`initdb`/`pg_ctl` binaries), schema built from `server/prisma/schema.prisma` |
| Prisma client | Generated with a WASM query engine + `@prisma/adapter-pg`, because `binaries.prisma.sh` (the native-engine CDN) is blocked by this sandbox's network policy. This is a **test-harness workaround only** — nothing in `server/` was changed to require it, and the project still uses the normal `prisma-client-js` generator. |
| Redis | **Not available in that verification run.** BullMQ-backed queue paths (engine job ingestion, matching, scraping, analytics workers) could not be exercised end-to-end in that environment. The current discovery implementation now includes Remotive, LinkedIn, and Indeed; live browser-provider verification requires Redis + worker + Playwright Chromium. |
| Browser | Real Chromium (Playwright, Google Chrome for Testing 131) — used for the web app, the browser extension (loaded unpacked, real service worker), and the mobile app exported for web (`expo export --platform web`) |
| Mobile native | **Not available.** No Android SDK, no emulator, no device. Native deep-link handling (cold start, backgrounded, killed) was **not** tested on a real OS. |
| Email | No SMTP/Resend key configured — the app's own documented dev fallback (logging the reset link) was used to retrieve real, server-issued tokens for testing |

All fixes described below were made directly in the project (`server/`, `mobile/`,
`browser-extension/`). The Prisma-WASM workaround, the exported mobile-web bundle, and the
local Postgres/API/web processes used to test them exist only in the sandbox's `/tmp` and are
**not** part of the delivered project or ZIP.

---

### 2. Project integrity

- Web (`client/`), Mobile (`mobile/`), Server (`server/`), and Browser Extension
  (`browser-extension/`) are all present with intact `package.json` manifests.
- `.env.example` templates present for server and mobile; no real `.env` files, no
  private keys, no credential files (`google-services.json`, `credentials*.json`, etc.)
  found anywhere in the tree.
- Secret scan (API keys, OpenRouter/Anthropic/OpenAI-style keys, Google API keys/OAuth
  secrets, AWS keys, GitHub tokens, private-key blocks, Slack/Stripe tokens, DB connection
  strings with embedded passwords, JWTs, generic `SECRET=`/`TOKEN=` assignments): the only
  hits were in `docs/*.md`, and every one is a placeholder (`user:password@host` example
  connection string), confirmed by reading each line in context. **No real secrets found.**
- `server/.env.example` and `mobile/.env.example` have every sensitive key present but
  **empty**.

**Result: PASS.**

---

### 3. Automated tests (re-run independently in this sandbox)

| Suite | Result | Notes |
|---|---|---|
| Server (`node --test`) | **160 / 160 pass** | Started at 153/155 (1 fail, 1 skip); see §6 |
| Client (`vitest`) | **16 / 16 pass** | Unchanged; only covers Resume Tailoring — no coverage for Auth, Profile, Settings, or the Job flow |
| Client production build (`vite build`) | **PASS** | |
| Client lint (`eslint`) | **6 errors, 1 warning** | Pre-existing tool-version drift (`react-hooks/set-state-in-effect`, `react-refresh`), not caused by this pass; see §6 |
| Extension (`node --test`) | **47 / 47 pass** | Requires `npm ci` in `browser-extension/` (needs `jsdom`, a `devDependency` already declared) |
| Extension loads in a real browser | **FAIL → fixed → PASS** | See §6 (missing icon files) |
| Mobile `tsc --noEmit` | **PASS** | |
| Mobile integration tests (`node --test`) | **27 / 27 pass** | Started at 25/27; see §6 |
| Mobile Metro bundle (Android + iOS, `verify-bundle.js`) | **PASS** (11.5 MB / 11.2 MB) | Ran **before** the last three mobile fixes (item 8, 9, 10 in §6) — needs a final re-run, see §11 |
| Server build/typecheck | **N/A** | No build or typecheck script exists for the server (plain Node, no bundler) |

---

### 4. Bugs found and fixed

All fixes are **in the delivered project tree**, not the test harness.

1. **Password-reset redirect could be pointed at an attacker's host (High, confirmed live, fixed).**
   `POST /api/auth/forgot-password` with `source=mobile` accepted *any* `exp://` URL as
   `redirectUri` and appended the live reset token to it. Confirmed by generating a real reset
   email with `redirectUri=exp://attacker.example.com:8081/--/x` — the server produced a
   working link to that host. `server/utils/mobileRedirect.js` now exports a dedicated,
   stricter `isAllowedResetRedirect()` (kept separate from the existing, more permissive Gmail
   OAuth redirect validator) that accepts **only**:
   - exactly `mobile://reset-password` (any environment), or
   - `exp://<loopback-or-private-LAN host>[:port]/--/reset-password` — **development only**
     (`NODE_ENV !== "production"`), no query string, no userinfo.
   Re-tested live: attacker hosts, extra query params, and `https://` targets now get `400`;
   the two legitimate destinations still work. 4 new regression tests cover this
   (`tests/auth/passwordResetSecurity.test.js`).

2. **Reset email vulnerable to HTML injection (Medium, fixed).** `resetUrl` — partly
   client-influenced via `redirectUri` — was interpolated into the email's `<a href="...">`
   unescaped. Added `escapeHtml()` in `server/services/emailService.js` and a plain-text email
   part. Covered by a new test that injects `"><img src=x onerror=...>` and asserts it cannot
   survive in the HTML part.

3. **Reset token logged in production (Medium, confirmed, fixed).** With no `RESEND_API_KEY`
   configured, the full reset link (including the live token) was written to `console.warn`
   unconditionally. Now gated on `NODE_ENV !== "production"` — the dev fallback (needed to
   test the flow without email infrastructure) still works locally. Covered by a new test.

4. **Browser extension failed to load entirely (High, confirmed in real Chromium, fixed).**
   `manifest.json` referenced `icons/icon16.png`, `icon48.png`, `icon128.png`, but the
   `icons/` folder did not exist in the delivered project. Verified with a real, launched
   Chromium instance (not just static inspection) — the extension produced **no service
   worker at all**, i.e. it would not load unpacked as shipped. Confirmed the cause by
   reproducing the same failure in a scratch copy with the icon references stripped.
   Generated `icons/icon16.png`, `icon48.png`, `icon128.png` from the existing TrackTrail "TT"
   brand mark (`mobile/assets/images/icon.png`) and added a `default_icon` entry to the
   `action` block. Re-verified: the extension now loads (real service worker registered), and
   all 47 unit tests still pass.

5. **Web Dashboard overflowed horizontally at every phone width (High, confirmed, fixed).**
   The two-column grid (`lg:grid-cols-[1.3fr_1fr]`) had no `grid-cols-1` fallback below `lg`,
   and the table card had no `min-w-0`, so the layout forced a minimum width wider than the
   viewport at 320–1024px. Fixed in `client/src/pages/Dashboard.jsx`. Confirmed by a real
   Chromium sweep (see §9) — this was the single largest source of overflow findings before
   the fix.

6. **Desktop navigation overflowed between ~640px and ~1080px (Medium, confirmed, fixed).**
   `Navbar.jsx` switched from the mobile hamburger to the full desktop nav at the `sm`
   breakpoint (640px), but the desktop nav itself needs roughly 1080px to lay out without
   wrapping/overflow. Moved the breakpoint to `xl` (1280px) in
   `client/src/components/Navbar.jsx`. Confirmed fixed at 640, 768, 900, and 1024px.

7. **Test assertions were stale, not the code they tested (Low, fixed without touching
   behavior).** Two server/mobile tests asserted single-quoted import strings against
   double-quoted source (`server/tests/resumeTailoring/security.test.js`,
   `mobile/tests/notifications.test.cjs`); made the regexes quote-tolerant rather than
   rewriting working code to satisfy the test.

8. **`expo-sharing` version range didn't match what the SDK expects (Low, fixed).**
   `mobile/package.json` declared `~57.0.21`; the installed/expected version was `57.0.22`.
   Corrected the declared range in `package.json` and the lockfile.

9. **Mobile reset-password screen was unreachable for a signed-in user (Medium, confirmed,
   fixed).** `app/(auth)/reset-password.tsx` lived inside the `(auth)` route group, which
   `app/_layout.tsx` wraps in `<Stack.Protected guard={!isSignedIn}>` — so a reset link opened
   while any account was already signed in on the device would silently fail to reach the
   reset screen. Moved the screen to `app/reset-password.tsx` (outside both
   `Stack.Protected` branches, deliberately, with a comment explaining why) and updated the
   two other files that referenced its old path. Re-verified against a running instance of the
   app (exported for web, real routing): a signed-in user opening a reset link still reaches
   "Set a new password".

10. **Mobile Home's "⬆ Upload resume" quick action opened Edit Profile instead of the Resumes
    screen (Low, confirmed, fixed).** Edit Profile only has a paste-text field, not a file
    upload. Changed the action in `app/(drawer)/(tabs)/index.tsx` to navigate to `/resumes`.

11. **Mobile Profile screen had no Log out control (Low — this is explicitly required by the
    QA brief, fixed).** `app/(drawer)/(tabs)/profile.tsx` only exposed Edit Profile and
    Settings; Log out existed only inside Settings. Added a Log out button to Profile,
    reusing the same `useAuth().logout()` call and the same visual treatment as the one in
    Settings, so there are now two entry points as required, with no new/duplicated logic.

Items 9–11 were fixed after the mobile bundle check (§3) last ran; typecheck and the full
mobile test suite were re-run and are clean, but item **§11 in "Remaining limitations" below**
notes that the bundle check itself was not re-run after these three changes.

---

### 5. Password-reset — end to end (the most important area)

#### 5a. Web → Web (real browser, real server, real DB)

Driven through the actual UI in Chromium — signup, login, logout, a wrong-password login, the
"Forgot password?" link, retrieving the real emailed link (opened in a **fresh browser
context**, simulating clicking it from an email client), setting a new password, and signing
in again.

**21 / 21 checks passed**, including:
- Client-side mismatch validation on both signup and reset forms.
- The emailed web link contains no `source=` flag and never contains the password.
- **Replay of a used reset link fails** with a visible error (not silently, not with success).
- Old password stops working; new password works; the replayed password is never applied.
- Missing / malformed / garbage tokens each produce a clear on-screen error, no crash, no
  false success.

#### 5b. Mobile → Mobile app

The server's reset-link generation is unit-and-integration tested and was also driven live
against the real API (see item 1 in §4). The mobile app's **own screen behavior** — token
pickup, form validation, submit, success, replay, error states — was verified by exporting the
real Expo Router app for web (`expo export --platform web`) and driving it in Chromium; this
exercises the actual production route tree and the actual `reset-password.tsx` screen, not a
mock.

**14 / 14 checks passed**, including:
- **Cold start:** a fresh browser context (no prior app state) opening the reset link lands
  directly on "Set a new password" with the token pre-filled and read-only.
- **Signed-in cold start (the case that was broken — item 9 in §4):** a context that is
  already signed in as the same or a different account still reaches the reset screen when
  the link is opened. Re-tested after the fix.
- Mismatched / too-short passwords are rejected on-screen; success updates the stored
  password (verified against the real API); old password is rejected afterward; replay of the
  same link fails; missing/malformed/tampered/empty tokens are all handled without a crash or
  false success.

**What this does *not* prove:** the web export cannot exercise `Linking.createURL`, the OS
intent/URL-scheme handoff, or true cold-start-from-a-killed-process behavior, because there is
no Android/iOS runtime in this sandbox. See §7 and §11.

#### 5c. Extension → Extension

Confirmed, live, in a real loaded extension: tapping "Forgot password?" in the popup opens a
**new browser tab** at `<web app>/forgot-password?source=extension` — i.e. it leaves the
extension. The subsequent web page does show extension-specific copy, and the reset itself
completes successfully and the new password then works back in the extension popup — but the
reset UI does not run inside the extension.

**Classification: PARTIAL / LIMITATION**, not PASS — per the QA standard's explicit
instruction not to mark this PASSED if it ends in a browser.

The "no stable extension ID" justification in the prior implementation is only partially
correct: `server/.env.example` already hard-codes a per-developer
`EXTENSION_REDIRECT_URL=chrome-extension://<id>/dashboard.html` for the Gmail OAuth flow,
which shows the architecture for a stable, pinned ID (a `key` field in `manifest.json`) is
already anticipated elsewhere in the project. A genuine extension-native reset would need:
an https bounce page (to survive email-client link rewriting) that redirects into
`chrome-extension://<pinned-id>/...` using a `key`-pinned manifest ID, or a
`externally_connectable` message handshake. **This was not built** — it is a real
architecture change, not a bug fix, and is flagged here rather than attempted silently.

#### 5d. Security checks (live, against the real running server + DB)

All of the following were exercised as real HTTP requests against the running server, not
just read from source:

| Check | Result |
|---|---|
| Missing token | 400 |
| Malformed (non-JWT) token | 400 |
| Tampered signature | 400 |
| `alg: none` token | 400 |
| A valid **login** JWT used as a reset token | 400 (wrong `purpose` claim) |
| Expired token, correctly signed | 400 |
| Token lifetime | exactly 1800s (30 min), measured from a live-issued token's `iat`/`exp` |
| Replay of an already-used reset token | 400 |
| An older, still-unexpired sibling token issued before a reset | 400 (dies with any reset, via password-hash fingerprint) |
| Forgot-password response for a known vs. unknown email | **Identical** — no account enumeration |
| Token appears in any API response body | **Never** |
| Short/weak new password | 400 |

#### 5e. Source-aware reset matrix

| Request Source | Expected Destination | Actual Destination (verified) | Result |
|---|---|---|---|
| Web | Web reset page | Web reset page, full flow verified in real Chromium | **PASS** |
| Mobile | Mobile app reset screen | Correct app screen reached via real routing, cold start included, in a **web export** of the app; native OS deep-link handoff not tested | **PARTIAL** (server + app-routing: PASS; native deep link: **BLOCKED**, see §7) |
| Extension | Extension reset flow | Opens a **browser tab**, not the extension | **PARTIAL / LIMITATION** |

---

### 6. Test-failure classification (per the required A–E categories)

| # | Failure | Category | Evidence | Action taken |
|---|---|---|---|---|
| 1 | Server: `tests/resumeTailoring/security.test.js` — import-string regex | **C** (outdated assertion) | `mobile/services/resume.ts` genuinely imports from `@/services/api`, just with double quotes and a trailing comma the regex didn't allow | Widened the regex; left the source file untouched |
| 2 | Mobile: `notifications.test.cjs` test 10 — notification-payload regex | **C** (outdated assertion) | `hooks/use-resume.ts` does emit the `resume_tailored` event with the real `versionId`, with double quotes/trailing comma the regex didn't allow | Widened the regex |
| 3 | Mobile: `expo-sharing` dependency-version test | **D** (dependency drift) | Lockfile already resolved `57.0.22`; `package.json` still declared `~57.0.21` | Aligned the declared range to the resolved version |
| 4 | Extension: failed to load in a real browser (not a test-suite failure, but a real defect the unit tests couldn't catch) | **E** (genuine implementation bug) | `icons/` folder absent; reproduced with a real Chromium launch, isolated by removing icon references in a scratch copy | Generated icons from the brand mark, wired up `action.default_icon` |
| 5 | Client lint errors | **D** (tool/rule-version drift) | `react-hooks/set-state-in-effect` and `react-refresh` rules flag ordinary load-in-`useEffect` patterns already present in the codebase; not a regression from this pass | Left as-is — see "Remaining limitations" |

No test's *intended* behavior was judged wrong, so no test assertions were weakened or
rewritten to hide a real bug — every code-level fix in §4 was made in production code, and
every test-level change was strictly a quote/format tolerance fix.

---

### 7. Environment limitations (stated plainly, not glossed over)

- **No Android SDK, emulator, or device.** This is the most significant gap relative to the
  QA brief's requirements: native deep-link behavior — Expo Go vs. dev build vs. release
  build, cold start, backgrounded, and killed-process launches — was **not tested** and
  **cannot be tested** in this sandbox. Everything reported as "PASS" for the mobile reset
  flow in §5b is scoped to the app's own screen/routing logic, verified via a web export of
  the real production route tree, not the native OS-to-app handoff.
- **No Redis.** BullMQ-backed paths (job ingestion into the engine's `jobs` table, matching,
  scraping workers, analytics aggregation) could not be run end-to-end. One specific
  consequence was observed and is flagged as an open question, not a confirmed bug: posting a
  job with extension-style source metadata to `POST /api/jobs` took ~40s to respond (a plain
  manual job took ~11ms), consistent with a queue client configured with
  `maxRetriesPerRequest: null` retrying against an unreachable Redis with no timeout. This
  should be re-checked with Redis actually running.
- **Prisma's native query engine could not be downloaded** (`binaries.prisma.sh` is blocked by
  this sandbox's network egress policy). A WASM-engine + `pg`-adapter workaround was used
  *only* to stand up a real database for testing; it required no changes to the delivered
  `server/` code or `prisma/schema.prisma`.
- **Google OAuth is unreachable**, so the Gmail "Connect" flow's real OAuth handshake was not
  exercised; the resulting graceful-failure UI state was checked (see §8), and the
  "connected" UI state was checked by directly setting a placeholder refresh token in the test
  database, not through a real OAuth grant.
- **No real email provider configured** (no `RESEND_API_KEY`). The reset flow was tested using
  the application's own documented development fallback (the link is logged rather than
  emailed). This is an existing, intentional feature of the codebase, not a workaround
  introduced for QA.

---

### 8. Functional QA — what was actually exercised (real browser, not source reading)

#### Web (desktop + 390px mobile viewport, real Chromium, against the live API + DB)
- **Auth:** signup, login, logout (session cleared, protected routes redirect), invalid
  credentials (clear error), password-mismatch validation on signup — all confirmed.
- **Profile:** edit name/experience/skills/resume text, save, **reload and verify
  persistence** — confirmed via both the UI and a direct API check.
- **Job flow:** validation blocks an empty submission; a real job (company, role, status,
  notes) submits successfully, appears on the Dashboard, and is confirmed persisted via the
  API with the correct status and notes.
- **Dashboard:** search filters the list correctly; status filter works; a no-match search
  shows an empty state; no horizontal overflow with real data loaded.
- **Applied Jobs:** renders without a desktop table overflowing the mobile viewport.
- **Integrations (Gmail):** disconnected state shows "Connect Gmail"; clicking it with no
  Google OAuth configured fails gracefully (a message is shown, the app does not crash or
  navigate away).
- **Analytics:** page loads, renders chart elements (SVG), no horizontal overflow.
- **Job Description flow (Resume Tailoring):** a real multi-paragraph JD was pasted
  (2,400+ characters, preserved in full, no truncation); a real `.docx` resume was uploaded
  through the file-input UI and confirmed accepted server-side (`201`); analysis against the
  uploaded resume returned a real match percentage and skill breakdown; no horizontal overflow
  at any point.

#### Web mobile responsiveness — real automated inspection, not CSS reading
**190 page × width combinations** checked with Playwright at 320, 360, 375, 390, 414, 640,
768, 900, 1024, and 1280px, across every route in `App.jsx` (public and authenticated),
measuring actual rendered `scrollWidth` and flagging any element extending past the viewport
in a non-scrollable container.

- **Before fixes:** 19 combinations showed real horizontal overflow, concentrated on
  Dashboard (grid layout, all widths ≤1024px) and the desktop nav bar (640–1024px).
- **After fixes (items 5 and 6 in §4): 1 remaining flagged item**, which on inspection was a
  raw Prisma error string rendered in a toast for one specific profile — caused by the test
  harness's own incomplete schema (a scalar-list column was initially missing from the
  hand-built test database), not a defect in the application. Once the test database was
  corrected, this did not reproduce.
- Hamburger menu, its touch targets (all ≥36px tall), and the notification panel were also
  checked directly: the notification panel stays fully within the viewport at both 320 and
  390px.

#### Browser extension — real loaded extension, real service worker, real backend
- Loads with a real service worker (after the icons fix); popup opens, is interactive.
- Login (including a visible, correct error for wrong credentials); manual "Add Job" form
  persists a job (confirmed via the API); Stats tab renders.
- **On-page job capture:** a mocked LinkedIn job page was used (real DOM structure, real
  selectors as used by `content.js`/`jd-extract.js`, network response mocked so no real
  scraping-policy violation occurred). The injected "Save to TrackTrail" button correctly
  extracted company, role, location, and description; the job was confirmed persisted via the
  API with the source URL attached; clicking Save a second time did **not** create a
  duplicate.
- The popup's message-passing to the content script (`TT_GET_DETECTED_JOB`) was exercised
  directly and returned the correct detected job.
- The extension's full-page dashboard (`dashboard.html`) loads, shows "Connected to backend",
  and all navigation destinations (Matched Jobs, Applications, Analytics, Companies, Sources,
  Profile, My Resumes) are present.
- No console errors were observed in the popup, the mocked job page, or the dashboard during
  any of the above.
- Manifest permissions reviewed: no unnecessary permissions found beyond what job detection
  and the existing API/Gmail flows require.

#### Mobile app (web export of the real production route tree, not a mock)
- **Home:** signed-in load shows real stats pulled from the API (verified against 4 seeded
  applications — total count and per-status breakdown all correct). All quick actions
  (Add job, Paste JD, Gmail, Upload resume, Analytics) were clicked and each navigates to a
  real, matching screen (Upload resume was broken — item 10 in §4 — now fixed and re-verified).
- **Profile:** shows Edit profile, Settings, Gmail Integration (live status), My Resumes — and
  now a direct Log out (item 11 in §4).
- **Edit Profile:** name/skills/resume text edits save and are confirmed persisted via a
  direct API check, and reflected on the Profile screen after a reload.
- **Settings:** confirmed **no** "Change Password" and **no** "Edit Profile" entries present
  (both explicitly required to be absent by the QA brief). Account/Preferences/Support
  sections present; a preference switch toggles and its new state survives a reload;
  Privacy/Terms/About links each open a real screen; the Gmail shortcut opens the Gmail
  screen; Log out clears the stored session and returns to sign-in, after which Home is no
  longer reachable without signing in again.
- **Gmail Integration screen:** disconnected state shows explanation + Connect button; a
  simulated connected state (see §7) shows "Connected", a Scan control, and Disconnect.
- **Job Description flow:** the same realistic multi-paragraph JD used for the web test was
  pasted into the mobile screen without truncation, no horizontal overflow, and the submit
  button remained reachable; without an uploaded resume, a clear on-screen message is shown
  (not a blank state or crash); after uploading the same `.docx` resume via the real API, the
  full analyze flow returned the **same match result** (skills, percentage) as the web flow
  against the identical JD and resume.

---

### 9. Cross-platform symmetry

Spot-checked terminology, status vocabulary, and branding across the three clients:

- **Brand mark:** consistent — the extension's newly-added icons were generated from the same
  source asset (`mobile/assets/images/icon.png`) already used by the mobile app, so the "TT"
  mark and its blue/gold gradient now match across mobile and the extension (the extension had
  no icon at all before this pass).
- **Statuses:** the extension's Stats/Add Job UI includes a "Wishlist" status option that does
  not appear in the web or mobile status vocabularies — a genuine (pre-existing) inconsistency,
  not addressed here since resolving it is a product decision (which status set is
  canonical), not a bug fix.
- **Terminology:** "Log out" vs. "Logout" and "Add Job" vs. "Add job" are used inconsistently
  across clients — cosmetic, not fixed, flagged for a future pass.
- Layout is intentionally **not** identical across platforms (per the QA brief — consistency
  of product/terminology was the goal, not pixel parity), and none of the differences found
  affect functionality.

---

### 10. Bugs found, not fixed (flagged for follow-up)

| # | Issue | Severity | Status |
|---|---|---|---|
| 1 | Login reveals account existence ("User not found" vs "Invalid Password") and auto-redirects unknown emails to `/register` | Low–Medium (enumeration) | **PRE-EXISTING**, not touched |
| 2 | No rate limiting on `/api/auth/login` or `/api/auth/forgot-password` | Medium | **PRE-EXISTING**, not touched |
| 3 | Login JWTs carry no session/version claim tied to a password reset, so a session issued before a reset may remain valid after — observed in the token's own claims, not independently confirmed against a live pre-reset session | Medium (unconfirmed) | **Flagged, not verified or fixed** |
| 4 | `db/schema.sql` referenced by setup docs is missing from the project; a fresh database cannot be created from `prisma/migrations/` alone (the earliest migration assumes an existing `tracked_jobs` table) | Medium (setup/DX) | **PRE-EXISTING**, not touched |
| 5 | Mobile reset screen's placeholder text ("paste the code from your email") doesn't match reality — the email contains only a tappable link, no separate code | Low (copy) | **Not fixed** |
| 6 | Extension's Save-job action can appear stuck on "Saving…" for 8+ seconds when the backend job-ingestion queue can't reach Redis (see §7) | Medium (unconfirmed root cause) | **Flagged, not fixed** — needs re-testing with Redis available |
| 7 | Gmail "not configured" error message surfaces raw environment-variable-style text to end users | Low (polish) | **Not fixed** |
| 8 | `browser-extension/config.js` documents a popup control for overriding the API base URL that does not exist in `popup.html`/`popup.js` | Low (doc/code mismatch) | **Not fixed** |
| 9 | Custom URL scheme (`mobile://`) links are not clickable in many email clients, and custom schemes are generally not verifiably ownership-bound on Android (unlike an HTTPS App Link) | Medium (deliverability/security), architectural | **Flagged, not fixed** — no device/emulator available to assess real-world impact; worth a dedicated follow-up (Android App Links / iOS Universal Links) |

None of the above were "fixed" by weakening a test or hiding the symptom — each is either
pre-existing and out of scope for this pass, or explicitly flagged as needing more
infrastructure (Redis, a real device, real email/OAuth) than is available here.

---

### 11. Remaining limitations / what is still unverified

1. **Native mobile deep links are entirely unverified.** This is the single biggest gap
   against the QA brief. Everything about the mobile reset flow that *can* be tested without a
   device/emulator has been (server-side redirect validation, the app's own routing and screen
   logic via a web export) — but the actual `exp://`/`mobile://` OS-level handoff, Expo Go vs.
   dev-build vs. release-build differences, and cold/background/killed-process launch states
   were **not tested**.
2. **The mobile Android/iOS bundle verification (`verify-bundle.js`) was run before the last
   three mobile code changes** (items 9, 10, 11 in §4 — the reset-screen route move, the
   Upload-resume fix, and the Profile Log out addition). `tsc --noEmit` and the full mobile
   `node --test` suite were re-run clean after those changes, but the Metro/Hermes bundle
   check itself needs one more run to be certain those specific files bundle correctly for
   Android and iOS. This is noted here rather than silently assumed to still pass.
3. **Queue-dependent behavior (Redis) is unverified**, including whether the extension's
   "Saving…" delay (§10, item 6) is actually caused by the missing Redis, and whether
   job-matching/analytics workers function correctly under load.
4. **Gmail's real OAuth handshake is unverified** — only the disconnected-state UI, the
   graceful-failure path when OAuth isn't configured, and a *simulated* connected-state UI
   (via a placeholder database value, not a real token) were checked.
5. **Client lint errors (6) were not fixed** — they stem from `eslint-plugin-react-hooks` /
   `eslint-plugin-react-refresh` rule versions flagging pre-existing, working patterns, not
   from anything changed in this pass. Fixing them would mean non-trivial refactors to files
   this QA pass did not otherwise need to touch, which was avoided per the "no broad rewrite"
   instruction.
6. **Extension-native password reset was not built** — see §5c. This is flagged as an
   architecture gap, not silently marked passing.

---

### 12. Final pass/fail matrix

| Area | Result |
|---|---|
| Project integrity / secrets | **PASS** |
| Server tests (160/160) | **PASS** |
| Client tests + build | **PASS** |
| Client lint | **PARTIAL** (pre-existing, unrelated to this pass) |
| Extension tests + real load | **PASS** (after fix) |
| Mobile typecheck + integration tests | **PASS** |
| Mobile native bundle build | **PARTIAL** (passed before last 3 fixes; needs one more run — see §11.2) |
| Web functional QA | **PASS** |
| Web responsive QA (190 combos) | **PASS** (after 2 fixes) |
| Web password reset, end to end | **PASS** |
| Mobile password reset (app routing/logic) | **PASS** |
| Mobile password reset (native deep link) | **BLOCKED** — no device/emulator available |
| Extension password reset | **PARTIAL / LIMITATION** — ends in a browser, by design constraint, not a bug left unfixed |
| Extension functional QA | **PASS**, with one unresolved timing concern (§10.6) |
| Reset-token security (expiry, replay, redirect validation, tampering) | **PASS** — all verified live against the running server |
| Cross-platform symmetry | **PASS**, with cosmetic inconsistencies noted, not fixed |

No claim of "fully tested" is made for native mobile deep linking, Redis-backed queue
behavior, or real Gmail OAuth — those remain genuinely open, for the environment reasons
stated in §7 and §11, not because they were assumed to work.

---

## Addendum — roles, platforms, URLs, Gmail filtering

Verified by automated tests: admin gating on `/api/scrape` and `/api/admin`
(401/403/200), delete-API refusals (409 in-flight / has-jobs), URL
normalization, extractor sync (server copy == extension file), Gmail relevance
classification and dedup, per-platform extraction fixtures (6 platforms),
web `AdminRoute`/Navbar/`AdminDeleteButton` gating. See
`docs/11_Roles_Permissions_Platforms_and_Release_Notes.md` §9 for what could
not be verified (live-site selectors, `prisma generate` in the sandbox, the
mobile app on a device).
