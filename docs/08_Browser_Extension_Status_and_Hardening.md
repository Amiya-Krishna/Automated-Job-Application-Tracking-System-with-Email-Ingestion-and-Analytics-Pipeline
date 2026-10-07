# 08 — Browser Extension (Chrome, Manifest V3)

Version 1.2.0. 92 tests (Node test runner + jsdom).

## What it does

- Floating **Save to TrackTrail** button on job pages of LinkedIn, Indeed, Naukri, Internshala, Wellfound and Unstop; saved jobs keep their canonical posting URL.
- Popup mini-dashboard: browse, search, filter, add, change status, delete; full dashboard page with Matched Jobs (read-only catalog), Applications, Analytics, Profile, Sources, Companies, Email (Gmail scan) and **My Resumes**.
- **Resume match** panel on job pages: analyse the posting against the resume, or start a tailoring run and review the result in the web app. The extension contains no AI logic or credentials; it extracts the job and calls the authenticated `/api/resume/*` API.

## Extraction

Layered per field: platform selectors → schema.org `JobPosting` JSON-LD → page title/meta, so a markup change degrades gracefully. All selectors live in `platform-extractors.js`; the server keeps a verified copy used by discovery (`npm run sync:extractors`, enforced by a test). Pages that are not a single posting are ignored. Missing fields are left empty, never invented. Selectors come from public markup and fixtures and were not verified against the live sites.

## Security model

- Manifest permissions are minimal: `storage`, `activeTab`, and host access to the API origin. Content scripts run only on the six job sites. CSP: `script-src 'self'; object-src 'self'`.
- Authentication uses the same short-lived access token plus rotating refresh token as mobile (`x-client: extension`); a blocked account is signed out and shown the blocked message without retrying.
- The extension never calls admin APIs (a test asserts this). Saved jobs are always **private** to the user: the server re-classifies whatever source the extension sends, so it cannot create global jobs.
- Gmail OAuth for the extension runs in the existing tab; the server signs the relay page and extension id into the OAuth `state`; refresh tokens stay server-side.

## Install

Not published to the Chrome Web Store. `chrome://extensions` → Developer mode → Load unpacked → select `browser-extension/`. The API origin is `DEFAULT_API_BASE_URL` in `config.js` and the manifest `host_permissions`; change both when pointing at another deployment.

## Limits

- Sites change markup often and some use login or bot walls; the Save panel always lets the user edit fields manually.
- Only the six listed sites are supported; other career pages can use "paste job description" in the web app (URL-based import is intentionally absent because of SSRF risk).
