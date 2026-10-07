# TrackTrail Browser Extension (Chrome, Manifest V3)

Saves job postings from LinkedIn, Indeed, Naukri, Internshala, Wellfound and Unstop to your TrackTrail account, shows how well your resume matches, and starts truthful resume tailoring. Details: [docs/08](../docs/08_Browser_Extension_Status_and_Hardening.md).

## Install (unpacked)

1. Open `chrome://extensions` and enable **Developer mode**.
2. **Load unpacked** → select this `browser-extension/` folder.
3. Click the toolbar icon and sign in with your TrackTrail account.

The API origin is `DEFAULT_API_BASE_URL` in `config.js` and in the manifest `host_permissions`; change both to use another deployment. Not published to the Chrome Web Store.

## Features

- **On-page**: "Save to TrackTrail" button and a Resume match panel (Analyze JD, Tailor Resume, Save Job).
- **Popup**: Jobs, Add, Stats; open the full dashboard from there.
- **Dashboard**: Matched Jobs (read-only), Applications, Analytics, Profile, Sources, Companies, Email (Gmail scan), My Resumes.

## How extraction works

Per field: platform selectors → schema.org `JobPosting` JSON-LD → page title/meta. Selectors live in `platform-extractors.js`; the server keeps a verified copy (`cd ../server && npm run sync:extractors`). Listing/search pages are ignored. Selectors were written from public markup and fixtures and are not guaranteed against the live sites; every field is editable before saving.

## Security

Minimal permissions (`storage`, `activeTab`, the API host); content scripts only on the six job sites; no AI logic or credentials in the extension; short-lived access token with rotating refresh token; saved jobs are always private to the user; a blocked account is signed out without retrying; admin APIs are never called.

## Tests

```bash
npm ci
npm test       # 92 tests (Node test runner + jsdom); needs ../server dependencies installed
```
