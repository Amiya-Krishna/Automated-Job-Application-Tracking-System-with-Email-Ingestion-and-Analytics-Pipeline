# TrackTrail Browser Extension — Status

> **Consolidated from:** `BROWSER_EXTENSION_STATUS.md` and the "Browser extension" section of `IMPLEMENTATION_SUMMARY.md`.
> Related: extension functional QA, the missing-icons load failure and the extension password-reset limitation → `10`; extension role in the overall structure → `01`; resume manager in the extension → `09`.

---

Scope: production-hardening pass over `browser-extension/` (popup, on-page dock, resume match/tailor panel, dashboard, manifest). It continued the earlier Codex/Copilot work and preserved it.

**No server files were changed.** Everything below is extension-only.

## 1. Architecture and auth/session flow

- MV3 extension. `background.js` (module service worker) is the only place that talks to the TrackTrail API for popup/panel/dock. Content scripts and the popup send messages; they never hold tokens.
- **Tokens live in `chrome.storage.session`** (`accessToken`, `refreshToken`, `user`) — never written to disk. A browser restart requires sign-in again. The optional `apiBaseUrl` override lives in `chrome.storage.local`.
- **Every API request sends the header `x-client: extension`** (plus `token: <accessToken>`), which selects the existing extension-compatible branch on the server. There is no second auth system.
- On a 401, `refreshSession()` calls `POST /auth/refresh` with the rotating refresh token.
  - **Single-flight:** concurrent callers share one refresh (the token rotates, so a second concurrent refresh would reuse a spent token).
  - **Only a definitive rejection (400/401/403) clears the session.** A `403 account_blocked` (account blocked by an administrator) signs the user out, shows "Your account has been blocked. Please contact an administrator." and is not retried; login surfaces the same message.
  - (Rule continues:) 429, 5xx and network failures do not sign the user out.
  - GET/HEAD requests are retried once after a refresh. **Mutations are never replayed**; the caller gets `session_restored` and the user repeats the action.
- All authorized calls go through `authorizedFetch` → `apiJson`, which throws coded `TTError`s (`session_expired`, `session_restored`, `network`, `rate_limited` + `retryAfterSeconds`, `server_error`, plus the API's own 4xx `code`). 5xx bodies are replaced with a generic message; unknown exceptions are reported as "Something went wrong."
- Background messages added: `REFRESH_SESSION`, `OPEN_PANEL`, `CHECK_JOB_TRACKED`, `OPEN_DASHBOARD`. Messages to content scripts: `TT_GET_DETECTED_JOB`, `TT_OPEN_PANEL`.
- `API_REQUEST` (generic proxy) is refused when `sender.tab` is set (content scripts) or the path doesn't start with `/`.
- `GET_SESSION` returns `expired: true` when a session ended (so the popup can say why), and reports network/server trouble as an error **while keeping the session**.
- `resume-api.js` (used by the dashboard's "My Resumes", needs FormData/Blob) reads the access token from `chrome.storage.session` itself but does not refresh on its own: it asks the background via an injected `refreshSession` (`REFRESH_SESSION`) and retries GETs once. It never replays mutations.
- `ui-errors.js` (new, classic script, loaded by popup, dashboard and content scripts) classifies error responses into `session | session-restored | offline | rate-limited | server | validation | error` and decides whether Retry is offered.

## 2. Popup UX and job detection

- Views: boot skeleton, offline/server-trouble (with Retry), signed-out, signed-in.
- "This page" card (Detect → Understand → Save/Analyze → Confirm → Open). Phases: loading, unsupported page, page not ready (reload needed), no job found, error, ready, already tracked, saved.
- `GET_DETECTED_JOB` asks the active tab's content script. If it doesn't answer, `activeTab` gives the tab URL to distinguish "not a job site" from "job site, reload needed".
- "Already tracked" matches by the site's job id (+ source) or the exact canonical `sourceUrl` only, never by title/company.
- If the title or company wasn't read, the popup asks the user to fill them in and disables Save until both are present. Placeholders like "Unknown company" are never saved from the popup/dock.
- A "Save as" status picker sits next to Save. "Check resume match" opens the on-page panel (`OPEN_PANEL`). Confirmation offers "Open in dashboard" (`dashboard.html#applicationsTab`).
- Jobs tab: skeleton loading, load-error box with Retry, empty state (no jobs vs no matches, with an "Add a job manually" action), inline note editing via a real button, status select and delete with labelled controls.
- Offline/online events show a banner and refresh on reconnect. A session that ends mid-use returns to sign-in with a message.

## 3. Content-script dock (`content.js`)

- Replaces the two floating pills (and `content.css`, now deleted) with one compact dock in a Shadow DOM, default `bottom: 88px; right: 16px` (above LinkedIn's messaging bar). It can be minimized and moved to the other side (`tracktrail_dock_left` in `storage.local`).
- States: detected, incomplete details (one-tap save hidden; user is pointed to the popup), read failure on a job URL after ~5s (with "Try again"; nothing saved), already tracked (`CHECK_JOB_TRACKED`, once per URL, signed-in only), saved/duplicate, session ended, extension updated (reload page).
- Save re-detects at click time (SPA navigation). After saving it states the status used and links to the dashboard.
- Routine status uses a polite live region; errors use a separate `role="alert"` region.

## 4. Resume match, tailoring and viewer

- `tailor-panel.js`: match score with a text verdict (Strong/Partial/Weak) and a `role="meter"`; counts of matched/related/missing; "How is this calculated?" (full match 1, related 0.5, missing 0; required skills weigh more than optional — mirrors the server's constants); results grouped as Matched / Related / Not found with "Show all".
- Skills marked ✕ are never added to the resume (text retained). Copy states that analysis/tailoring only prepares a draft and **TrackTrail never applies to jobs**; the success box repeats that a draft is not an application.
- Tailoring: step list + native `<progress>`, step announcements, a **Cancel** button (run-id guard stops stale polling loops), Retry on failure, sign-in hint on session errors.
- Panel Save uses the page's role/company or what the user typed; it refuses to save if either is missing. Every action re-reads the page, so stale detection isn't reused.
- Resume selection is a radiogroup (roving tabindex, arrow keys).
- Dashboard resume viewer (`resume-manager.js`): focus moves into the dialog, Tab is trapped, Escape closes, focus returns to the opener (falls back to Refresh if the list re-rendered).

## 5. Dashboard improvements

- Loading skeletons for Matched, Applications, Analytics, Companies and Sources; load errors show a Retry button (`setError`); Gmail status errors get Retry too.
- Tables scroll horizontally instead of clipping (`overflow-x: auto`, sticky header); extra rules at ≤560px.
- `dashboard.html#<tabId>` deep links (`hashchange` supported); nav items set `aria-current="page"`.
- Confirm dialog is an `alertdialog`: default focus on Cancel, Tab trap, Escape, background `inert`, focus return.
- Sidebar no longer claims "Connected to backend" (it was static); it now says "TrackTrail dashboard".
- Removed the unused unauthenticated `api()` helper from `dashboard.js`.
- Dashboard's resume API now uses the shared session refresh (previously it never refreshed and failed once the access token expired).

## 6. Accessibility and focus handling

- Labels on all form fields (`for`/`aria-label`); tabs use `tablist/tab/tabpanel` with arrow/Home/End keys; filter chips use `aria-pressed`; icon buttons have `aria-label`s.
- Live regions: popup `#popupLive` (polite), error `<p>`s `role="alert"`, dock and panel have persistent polite + alert regions (not recreated on re-render).
- Visible focus rings (`#0e7490` light / `#67e8f9` dark) in popup, dashboard, dock and panel; interactive targets raised to ≥32px (popup) / ≥36px (dashboard) where previously ~26px.
- Focus is restored by `data-key` after DOM rebuilds (panel, popup page card), so keyboard focus and the paste box caret survive polling/re-render. If the focused control disappears or is disabled, focus moves to the dialog container.
- Status is never colour-only (icons/text prefixes and group headings). Skeleton shimmer respects `prefers-reduced-motion`.
- The dark-theme button colour in dock/panel was darkened to `#0e7490` for contrast.

## 7. Error handling and retry behavior

- Handled cleanly: 401/session expiry, offline/network, 429 (message includes wait seconds), validation (API message passes through, no Retry for codes like `no_resume`, `jd_too_short`), duplicate save (200 with `duplicate: true`), 5xx (generic message).
- Retry is offered on: popup page card, jobs load, popup save/open-panel, dock save and read-failure, panel actions (`lastAction`), dashboard loaders. Session errors show a "sign in, then retry" hint.
- No stack traces or raw backend messages reach the UI.

## 8. Security, XSS and manifest

- **XSS fix:** dashboard Companies and Sources tables built rows with `innerHTML` from scraped names/URLs; now DOM/`textContent` only. Source links are rendered only for `http(s)` URLs, with `rel="noopener noreferrer"`. Stat cards and funnel rows also no longer use `innerHTML`. (Remaining `innerHTML` in the extension: `theme.js` static icons, and `= ""` clears.)
- No native `alert()`/`confirm()`/`prompt()` in application code (grep-checked).
- Manifest: added `minimum_chrome_version: "102"` (needed for `chrome.storage.session`); explicit CSP `script-src 'self'; object-src 'self'`; registered `ui-errors.js`; removed `content.css`; **removed the LinkedIn/Indeed `host_permissions`** (content-script `matches` should be sufficient — needs manual confirmation). Kept `storage`, `activeTab`, and the TrackTrail API host permission. There was no localhost permission and no `web_accessible_resources` to remove.
- Content-script dock/panel live in Shadow DOM; content scripts cannot use the generic API proxy.

## 9. Files

**Changed:** `background.js`, `content.js`, `manifest.json`, `popup.html`, `popup.js`, `popup.css`, `tailor-panel.js`, `resume-api.js`, `resume-manager.js`, `dashboard.html`, `dashboard.js`, `dashboard.css`, `tests/background.test.js` (5 tests added; `send()` helper now accepts an optional sender).
**Added:** `ui-errors.js`, this document.
**Deleted:** `content.css`.
**Intentionally unchanged:** `jd-extract.js`, `config.js`, `theme.js`, `package.json`, `package-lock.json`, `README.md`, `tests/panel.test.js`, `tests/extract.test.js`, `tests/resumes.integration.test.js`, and everything outside `browser-extension/` (including all of `server/`).

## 10. Testing

**Performed:**
- `node --check` on every extension JS file and test file: all passed. `manifest.json` parses as valid JSON.
- `node --test tests/background.test.js`: 12/12 passed (7 existing + 5 new: 5xx sanitising / 429 code+retry / network code; outage does not sign out and rejected refresh does; concurrent 401s share one refresh; `API_REQUEST` refused for content scripts and non-absolute paths; mutations not replayed after refresh).
- Static cross-check that every element id used by `popup.js` and `dashboard.js` exists in the HTML (or is created dynamically).
- Grep checks for `alert(`/`confirm(`/`prompt(`, `localhost`, and remaining `innerHTML`.

**Not performed:**
- **`tests/panel.test.js`, `tests/extract.test.js` and `tests/resumes.integration.test.js` were not run: jsdom was unavailable and no dependency installation (`npm install`) was performed.** I reviewed the panel/dashboard changes by hand against the strings and selectors those tests assert on, but that is not a test result.
- No run in a real browser, no load-unpacked check, no screen-reader or keyboard walkthrough, no visual/responsive check, no server or end-to-end test, no test of the new popup/dock/dashboard code paths beyond syntax.

## 11. Known remaining issues

1. **Save status defaults to "Applied".** Saving from the dock or the panel uses `toSaveJob`, which sets `status: "Applied"`; the popup's "Save as" picker also defaults to "Applied" (choosable, incl. Wishlist). Someone only bookmarking a job from the dock gets an "Applied" record (the dock/panel now state the status used). Decide whether the dock/panel should default to Wishlist or ask.
2. Removal of LinkedIn/Indeed `host_permissions` is unverified in a real browser.
3. Content-script `matches` for Indeed is still `https://*.indeed.com/*` (broad); narrowing was not attempted.
4. Dock position/overlap on real LinkedIn/Indeed layouts is unverified.
5. "Already tracked" lookup fetches the full jobs list (shared single-flight request) once per job URL when signed in.
6. Panel Retry during tailoring starts a new tailoring run rather than resuming polling.
7. Extension version (`1.1.0`) not bumped; README not updated; unused `.detectedCard*` CSS remains in `popup.css`.
8. The `Wishlist` status option was already present in the popup's Add tab; server acceptance of it was not re-verified in this pass.

## 12. Manual verification checklist

- [ ] `cd browser-extension && npm install && npm test` (panel, extractor, background, resumes integration all green).
- [ ] Load unpacked in Chrome ≥102; confirm no manifest warnings and the dock appears on a LinkedIn job page and an Indeed job page (validates the removed host permissions).
- [ ] Sign in; confirm tokens are absent from `chrome.storage.local` and present in `chrome.storage.session`; requests carry `x-client: extension`.
- [ ] Let the access token expire: jobs load and resume tab still work (refresh), no logout.
- [ ] Go offline in the popup: banner/Retry appears, session kept; reconnect recovers.
- [ ] Force 429 and 5xx from the API: friendly message, Retry works, no raw error text.
- [ ] Popup: unsupported page, unreloaded job tab ("Check again"), no-job page, incomplete detection (Save disabled until filled), already-tracked job, save → confirmation → "Open in dashboard".
- [ ] Dock: minimize, move side, no overlap with LinkedIn messaging, save/duplicate/error states, read-failure state on a changed layout.
- [ ] Panel: analyze, grouped results, tailor with several resumes (radio keys), Cancel mid-run, Retry, Escape closes and returns focus to the dock.
- [ ] Dashboard: narrow window (table scrolls), each tab's loading/empty/error+Retry, `#applicationsTab` deep link, delete dialog and resume viewer (Escape, Tab trap, focus return).
- [ ] Companies/Sources with a name like `<img src=x onerror=alert(1)>` and a `javascript:` URL render as inert text.
- [ ] Keyboard-only and screen-reader pass (NVDA/VoiceOver) through popup, dock, panel, dashboard; check contrast in dark theme.
- [ ] Decide the Save-status default (issue 1) before release.

## 13. Popup job detection and password-reset link (implementation pass)

- Popup detects a job on the active tab (new `GET_DETECTED_JOB` -> content-script
  `TT_GET_DETECTED_JOB`, same extractor as the on-page button) and offers one-tap "Add job",
  with saved / already-added / retry states and honest hints when nothing is detected.
  Added the minimal `activeTab` permission.
- "Forgot password" opens the web page with `?source=extension`.

> **Note:** the final QA pass (`10`, §8) recorded the extension's full-page dashboard as showing "Connected to backend"; the hardening pass above (Section 5) records that the sidebar now says "TrackTrail dashboard" instead. The final QA pass (`10`, §4 item 4 and §10 item 8) also records the missing `icons/` folder fix and a `config.js` documentation mismatch.
