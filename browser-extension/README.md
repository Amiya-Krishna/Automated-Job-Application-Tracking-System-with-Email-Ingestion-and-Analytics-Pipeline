# TrackTrail Browser Extension — Chrome Manifest V3

TrackTrail's Chrome extension captures job postings from supported job sites and connects them to the same account, matching, application and resume-tailoring pipeline used by the web and mobile clients.

Supported sites:

- LinkedIn
- Indeed
- Naukri
- Internshala
- Wellfound
- Unstop

The extension is an unpacked development/review build and is **not published to the Chrome Web Store**.

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this `browser-extension/` directory.
5. Open the extension and sign in.

The API origin is configured in `config.js` and the manifest host permissions.

## Product surface

### On-page

- Save the detected job.
- Analyze the job description.
- View resume-match information.
- Start resume tailoring.
- Save/edit job details before submission.

### Popup

- Jobs.
- Add.
- Stats.
- Link to the full dashboard.

### Dashboard

The extension exposes dashboard views for matched jobs, applications, analytics, profile, sources, companies, Gmail scan and resumes.

## Extraction strategy

The extractor resolves fields in layers:

1. Platform-specific selectors.
2. Schema.org `JobPosting` JSON-LD.
3. Page title/meta fallback.

Listing/search pages are intentionally ignored.

The extension's platform extractor is synchronized with the server-side copy using:

```bash
cd ../server
npm run sync:extractors
```

A test detects drift between the two copies.

Because external job sites change their markup and may block automated access, extraction is best-effort. Missing fields are not invented, and users can edit detected values before saving.

## Security

- Minimal browser permissions.
- Content scripts only run on supported job sites.
- No model credentials are stored in the extension.
- Access tokens are short-lived.
- Refresh tokens use the backend rotation contract.
- Saved jobs remain user-private.
- Blocked accounts are signed out.
- The extension does not call admin APIs.

## Tests

```bash
npm ci
npm test
```

The documented verification run contains **92 extension tests**.

See [`docs/08`](../docs/08_Browser_Extension_Status_and_Hardening.md) for the detailed hardening and verification notes.
