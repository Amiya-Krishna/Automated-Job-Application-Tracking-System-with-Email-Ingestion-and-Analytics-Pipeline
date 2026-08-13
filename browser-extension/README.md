# TrackTrail Browser Extension

Manage your whole job search from the extension popup — no need to open the
dashboard site. Adds a floating **"+ Save to TrackTrail"** button on
LinkedIn and Indeed job postings, and the popup itself is now a mini
dashboard: browse, search, filter, add, change status, and delete jobs.

## Install (unpacked, for now — not published to the Chrome Web Store)

1. Open `chrome://extensions` in Chrome (or `edge://extensions` in Edge).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this `browser-extension` folder.
4. The TrackTrail icon should appear in your toolbar. Pin it for easy access.

## First-time setup

1. Click the TrackTrail icon in your toolbar.
2. Open **API settings** (gear icon, or the link on the login screen) and
   confirm the Backend API URL matches your deployed Render URL (it
   defaults to the one from this project — change it if you redeploy to a
   different URL).
3. Log in with the same email/password you use on the TrackTrail website.

## What's in the popup now

- **Jobs tab** — search by company/role, filter by status chip
  (Applied / Interviewing / Offer / Rejected), change a job's status
  inline from a dropdown, delete a job, open the original posting link.
- **Add tab** — add a job manually (company, role, status, link, notes)
  without needing to be on LinkedIn/Indeed.
- **Stats tab** — quick counts of total jobs and jobs per status.
- **Settings (gear icon)** — change the backend API URL without editing
  code.

## Using the on-page save button

1. Browse to any job posting on LinkedIn (`linkedin.com/jobs/...`) or
   Indeed (`indeed.com/...`).
2. A dark "+ Save to TrackTrail" button appears in the bottom-right corner.
3. Click it. The job's company and role are auto-detected from the page
   and saved with status "Applied". Edit the status or delete it later
   from the popup's Jobs tab.

## How detection works (and its limits)

The content script reads the job title and company name from the page
using a few known CSS selectors, with a fallback to parsing the page's
`<title>` tag if those selectors don't match. LinkedIn and Indeed change
their page markup periodically, so if the button stops picking up the
right company/role, the selectors in `content.js` likely need a quick
update — check `detectLinkedIn()` / `detectIndeed()`.

## Backend routes this extension uses (confirmed against `server/routes/jobRoutes.js`)

- `POST /api/auth/login`
- `GET /api/jobs` — list, scoped to the logged-in user
- `POST /api/jobs` — used for both on-page save and the manual Add tab
- `PUT /api/jobs/:id` — used by the status dropdown in the Jobs tab
- `DELETE /api/jobs/:id` — used by the delete button

`TrackedJob` fields (from `prisma/schema.prisma`): `company`, `role`,
`status`, `applicationDate`, `interviewDate`, `notes`. There's no `link`/URL
field on this model, so the popup doesn't send or display one.

The backend also has a separate, bigger "intelligent apply engine" (job
scraping, TF-IDF matching, auto-apply queue, analytics, profile) under
`/api/engine/jobs`, `/api/applications`, `/api/analytics`, `/api/profile` —
none of that is wired into the extension yet.

## Full dashboard (new)

The popup now has an **"Open full dashboard ↗"** button (visible once
logged in) that opens `dashboard.html` in a new tab. This is where the
bigger "intelligent apply engine" lives, since a 360px popup isn't enough
room for it:

- **Matched Jobs** — scraped jobs from `/api/engine/jobs`, filterable by
  status and minimum match score, with a "Queue apply" button that calls
  `POST /api/applications/:jobId`.
- **Applications** — `/api/applications`, filterable by status, with
  "Mark as applied" and outcome buttons (Interview / Offer / Rejected).
- **Analytics** — summary + conversion rates from `/api/analytics`, and
  a scraped → matched → applied → interview → offer funnel from
  `/api/analytics/funnel`.
- **Profile** — view/edit the resume/skills profile used for matching,
  via `/api/profile`.

These engine routes don't have the `auth` middleware applied in the code
you shared, so the dashboard calls them without a token. If you add auth
to them later, the dashboard's `api()` helper in `dashboard.js` is the one
place to add the `token` header.

### Heads-up: BigInt JSON crash risk

`jobs.id`, `applications.id`, and `applications.job_id` are Postgres
`BigInt` in your Prisma schema, and I didn't find a
`BigInt.prototype.toJSON` override anywhere in the project. Node's
`JSON.stringify` (which `res.json()` uses) throws on raw `BigInt` values,
so `GET /api/engine/jobs` and `GET /api/applications` will likely crash
with `TypeError: Do not know how to serialize a BigInt` the first time
they run. Fix: add this once near the top of `server.js`, before routes
are mounted:

```js
BigInt.prototype.toJSON = function () {
  return this.toString();
};
```



If you want a shareable install link instead of "load unpacked": zip this
folder's contents (not the folder itself) and submit it through the
[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
(one-time $5 developer fee). Not required for a portfolio/demo.
