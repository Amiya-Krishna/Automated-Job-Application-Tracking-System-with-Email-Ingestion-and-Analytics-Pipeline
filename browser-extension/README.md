# TrackTrail Browser Extension

Adds a floating **"+ Save to TrackTrail"** button on LinkedIn and Indeed job
postings. Click it and the job is saved straight to your TrackTrail account
— no copy/paste.

## Install (unpacked, for now — not published to the Chrome Web Store)

1. Open `chrome://extensions` in Chrome (or `edge://extensions` in Edge).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this `browser-extension` folder.
4. The TrackTrail icon should appear in your toolbar. Pin it for easy access.

## First-time setup

1. Click the TrackTrail icon in your toolbar.
2. Open **API settings** at the bottom and confirm the Backend API URL
   matches your deployed Render URL (it defaults to the one from this
   project — change it if you redeploy to a different URL).
3. Log in with the same email/password you use on the TrackTrail website.

## Using it

1. Browse to any job posting on LinkedIn (`linkedin.com/jobs/...`) or
   Indeed (`indeed.com/...`).
2. A dark "+ Save to TrackTrail" button appears in the bottom-right corner.
3. Click it. The job's company and role are auto-detected from the page
   and saved with status "Applied". Edit the details later from your
   TrackTrail dashboard if the auto-detected text isn't quite right.

## How detection works (and its limits)

The content script reads the job title and company name from the page
using a few known CSS selectors, with a fallback to parsing the page's
`<title>` tag if those selectors don't match. LinkedIn and Indeed change
their page markup periodically, so if the button stops picking up the
right company/role, the selectors in `content.js` likely need a quick
update — check `detectLinkedIn()` / `detectIndeed()`.

## Publishing to the Chrome Web Store (optional, later)

If you want a shareable install link instead of "load unpacked": zip this
folder's contents (not the folder itself) and submit it through the
[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
(one-time $5 developer fee). Not required for a portfolio/demo.
