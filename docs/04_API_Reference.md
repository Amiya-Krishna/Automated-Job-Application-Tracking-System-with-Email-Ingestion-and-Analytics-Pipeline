# API Reference

Complete reference for all TrackTrail API endpoints.

> **Consolidated from:** `API_ENDPOINTS.md` (Last Updated: August 25, 2026), including its appended "Mobile sessions, account & notifications" section.

---

---

## Base URL

```
http://localhost:5000/api
```

In production this is whatever host you deploy the server to.

---

## Authentication

Protected endpoints require a JWT, sent as a plain **`token`** request header
(not the `Authorization: Bearer` convention):

```
token: <your_jwt_token>
```

The token is returned by `POST /api/auth/login` and doesn't currently carry an
expiry — it's valid until your `JWT_SECRET` changes.

> **Session model by client (cross-reference):** the token described here is the web/extension legacy token (the mobile section below notes the 7-day token for web/extension). Mobile uses a 15-minute access token plus a rotating refresh token (see the mobile section below and `07`). Web uses memory-only access tokens with an `HttpOnly` refresh cookie (see `06`). The extension keeps tokens in `chrome.storage.session` and sends `x-client: extension` (see `08`).

**Current auth coverage** (verified against `server/server.js`'s route mounting
and each route file): `/api/auth` and `/api/gmail` are public/self-contained;
`/api/jobs` requires the token on every route (checked inside `jobRoutes.js`).
`/api/ingest`, `/api/engine/jobs`, `/api/applications`, `/api/analytics`,
`/api/profile`, `/api/companies`, and `/api/sources` all require the token,
applied at the `app.use(...)` mount level in `server.js`. `/api/scrape` also
requires the token on every route, applied per-handler inside
`scrapeRoutes.js` rather than at the mount level — functionally identical,
just organized differently in the code.

---

## Response Format

Responses are plain JSON — there is no `{ success, data }` envelope. A
successful response returns the resource (or an object with a `message`)
directly; an error response is:

```json
{ "message": "Error description" }
```

---

## 🔐 Auth Endpoints (`/api/auth`)

### 1. Register

**POST** `/api/auth/register`

**Request Body:**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Response (200):**

```json
{ "message": "User Registered Successfully" }
```

**Error (400):**

```json
{ "message": "User already exists" }
```

### 2. Login

**POST** `/api/auth/login`

**Request Body:**

```json
{
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Response (200):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

**Error (400):**

```json
{ "message": "User not found" }
```

or

```json
{ "message": "Invalid Password" }
```

> There is no `/logout` endpoint — logout is handled entirely on the frontend
> by discarding the stored token. There is also a forgot/reset-password flow
> (`server/routes/authRoutes.js`, `RESEND_API_KEY`-backed) not detailed here —
> see the route file directly for its exact shape.

---

## 💼 Job Tracker Endpoints (`/api/jobs`)

All endpoints below require the `token` header and only ever operate on jobs
owned by the authenticated user.

### 3. Create Job

**POST** `/api/jobs`

**Request Body:**

```json
{
  "company": "Tech Corp",
  "role": "Frontend Developer",
  "status": "Applied",
  "interviewDate": "2026-08-01",
  "notes": "Great company"
}
```

**Response (200):**

```json
{
  "id": 12,
  "userId": 1,
  "company": "Tech Corp",
  "role": "Frontend Developer",
  "status": "Applied",
  "interviewDate": "2026-08-01",
  "notes": "Great company",
  "createdAt": "2026-07-20T08:00:00.000Z",
  "updatedAt": "2026-07-20T08:00:00.000Z"
}
```

If enough data is present (company + role + a description or a source URL),
the job is also bridged into the engine pipeline in the background so it can
be matched/scored like a discovered job — see `services/engineBridge.js`.
This is fire-and-forget and never blocks or fails this response.

### 4. Get All Jobs

**GET** `/api/jobs`

Returns every job belonging to the authenticated user, newest first. No
pagination, filtering, or search query params are supported — the frontend
filters client-side.

**Response (200):**

```json
[
  {
    "id": 12,
    "userId": 1,
    "company": "Tech Corp",
    "role": "Frontend Developer",
    "status": "Applied",
    "interviewDate": "2026-08-01",
    "notes": "Great company",
    "createdAt": "2026-07-20T08:00:00.000Z",
    "updatedAt": "2026-07-20T08:00:00.000Z"
  }
]
```

### 5. Update Job

**PUT** `/api/jobs/:id`

**Request Body (any subset of):**

```json
{
  "status": "Interview",
  "notes": "Had a great interview, waiting for response"
}
```

**Response (200):** the updated job (same shape as above).

**Error (404):**

```json
{ "message": "Job not found" }
```

(returned if the id doesn't exist, or belongs to a different user)

### 6. Delete Job

**DELETE** `/api/jobs/:id`

**Response (200):**

```json
{ "message": "Job deleted" }
```

**Error (404):**

```json
{ "message": "Job not found" }
```

---

## 📧 Gmail Integration Endpoints (`/api/gmail`)

See [09_Gmail_Integration_and_Resume_Tailoring.md](09_Gmail_Integration_and_Resume_Tailoring.md) for the full OAuth setup.
All endpoints below require the `token` header.

### 7. Get Auth URL

**GET** `/api/gmail/auth-url`

**Response (200):**

```json
{ "url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

### 8. OAuth Callback

**GET** `/api/gmail/callback`

Not called directly by the frontend — Google redirects the browser here after
consent. Redirects on to `${CLIENT_URL}/integrations?gmail=connected` (or
`...=error` / `...=no_refresh_token`). No auth header (unauthenticated
browser redirect).

### 9. Connection Status

**GET** `/api/gmail/status`

**Response (200):**

```json
{ "connected": true }
```

### 10. Disconnect

**POST** `/api/gmail/disconnect`

**Response (200):**

```json
{ "message": "Gmail disconnected" }
```

### 11. Scan Inbox

**GET** `/api/gmail/scan`

Scans the last 30 days for interview/application/offer/rejection-looking
subject lines.

**Response (200):**

```json
{
  "messages": [
    {
      "id": "18cfa1...",
      "subject": "Moving forward with your application",
      "from": "recruiting@techcorp.com",
      "date": "Sat, 18 Jul 2026 10:00:00 -0700",
      "snippet": "We'd like to schedule..."
    }
  ]
}
```

**Error (400):**

```json
{ "message": "Gmail is not connected" }
```

---

## 🔎 Job Discovery Endpoints (`/api/scrape`)

Async discovery runs — the client triggers a run, then polls for status. See
the README's "Job Discovery" section for the full architecture. All endpoints
below require the `token` header and are ownership-scoped to the
authenticated user (a user can only see/act on their own runs).

**Discovery providers:** `remotive`, `linkedin`, and `indeed` are all active `sources` values. Remotive uses its public API. LinkedIn and Indeed use Playwright through their discovery adapters and the shared `server/services/scraper.js` implementation. Their results enter the same ingestion/deduplication pipeline. Browser/runtime failures and provider blocking are returned as per-source `error`/`blocked` results rather than fabricated empty success.

### 12. Start a Discovery Run

**POST** `/api/scrape/run`

**Request Body:**

```json
{
  "query": "backend engineer",
  "location": "remote",
  "sources": ["linkedin", "indeed", "remotive"],
  "limit": 25
}
```

`query` is required (max 255 chars). `location` is optional. `sources`
defaults to all registered sources if omitted; any value not in
`["linkedin", "indeed", "remotive"]` is rejected. `limit` defaults to 25, max
50. Rate-limited to 6 runs per hour per user.

**Response (202):**

```json
{ "status": "queued", "runId": 14, "sources": ["linkedin", "indeed", "remotive"] }
```

**Error (400):** invalid query/sources/limit.
**Error (429):**

```json
{ "message": "You can trigger at most 6 discovery runs per hour. Try again later." }
```

### 13. List Recent Runs

**GET** `/api/scrape/runs`

Returns the authenticated user's most recent runs (newest first, capped at
20) — this is what powers the "Recent runs" list on the Job Discovery page.

**Response (200):**

```json
{
  "data": [
    { "id": 14, "query": "backend engineer", "sources": ["linkedin", "indeed", "remotive"], "status": "succeeded", "createdAt": "2026-08-20T10:00:00.000Z" }
  ]
}
```

### 14. Poll a Run's Status

**GET** `/api/scrape/runs/:id`

The dynamic polling endpoint the dashboard calls every few seconds while a
run is `queued`/`running`. Intentionally sent with `Cache-Control: no-store`
and without an `ETag`, so it can never return a `304 Not Modified` — a stock
Express JSON response would otherwise be conditionally cacheable, and a raw
304 reaching the frontend's axios client (which only treats 2xx as success)
would throw and silently kill the polling loop. This is the only endpoint in
the API with this behavior; nothing else was changed.

**Response (200):**

```json
{
  "data": {
    "id": 14,
    "status": "succeeded",
    "query": "backend engineer",
    "sources": ["linkedin", "indeed", "remotive"],
    "results": {
      "linkedin": { "status": "ok", "found": 10, "ingested": 8 },
      "indeed": { "status": "ok", "found": 12, "ingested": 9 },
      "remotive": { "status": "ok", "found": 12, "ingested": 9 }
    },
    "createdAt": "2026-08-20T10:00:00.000Z"
  }
}
```

`status` is one of `queued`, `running`, `succeeded`, `failed`, `blocked`.

**Error (404):** run doesn't exist, or belongs to a different user.

### 15. Remove a Run

**DELETE** `/api/scrape/runs/:id`

Deletes one of the authenticated user's own run-history rows. This removes
only that `ScrapeRun` record — it never touches the shared `jobs` catalog,
`applications`, `match_scores`, or any `tracked_jobs` row, since a discovery
run's history is unrelated to what it may have ingested.

**Response (200):**

```json
{ "message": "Run removed" }
```

**Error (404):** run doesn't exist, or belongs to a different user (never
distinguishes the two, so a user can't probe for other users' run ids).

---

## 🤖 Intelligent Job Application Engine

These endpoints back the scraping/matching/apply/analytics engine described
in [02_Job_Application_Engine_Design.md](02_Job_Application_Engine_Design.md).
They read/write the Postgres `jobs`, `companies`, `job_sources`,
`applications`, `match_scores`, `user_profile`, and `tracked_jobs` tables
(via Prisma) — separate from `/api/jobs`' `tracked_jobs`-only usage above,
though `tracked_jobs` is also the source of truth for Applied Jobs and
Analytics. **All endpoints in this section require the `token` header**
(applied at the `app.use(...)` mount level in `server.js`).

### 16. Ingest a Job

**POST** `/api/ingest`

Shared entrypoint used by Job Discovery (Remotive, LinkedIn, and Indeed results), the browser
extension's manual capture, and the manual tracker's engine bridge — one
normalization/dedup code path for all three.

**Request Body:**

```json
{
  "title": "Backend Engineer",
  "company": "Acme Inc",
  "description": "Full job description text...",
  "location": "Remote",
  "remoteType": "remote",
  "sourceName": "remotive",
  "sourceUrl": "https://remotive.com/remote-jobs/software-dev/backend-engineer-12345",
  "externalJobId": "12345",
  "postedAt": "2026-07-15T00:00:00.000Z"
}
```

`title`, `company`, `description`, `sourceName`, and `sourceUrl` are required.

**Response (201):** result of normalization/dedup/insert (job id, whether it
was a duplicate, etc. — see `services/ingestionService.js`).

### 17. Browse Engine Jobs

**GET** `/api/engine/jobs?status=matched&minScore=70&page=1&pageSize=25`

**Response (200):**

```json
{
  "data": [
    {
      "id": 101,
      "title": "Backend Engineer",
      "location": "Remote",
      "remote_type": "remote",
      "status": "matched",
      "source_url": "https://...",
      "company": "Acme Inc",
      "score": 82.5,
      "explanation": { "matchedSkills": ["node.js", "postgresql"] }
    }
  ],
  "meta": { "page": 1, "pageSize": 25 }
}
```

### 18. Get a Single Engine Job

**GET** `/api/engine/jobs/:id`

**Response (200):** `{ "data": { ...full job row, company, score, explanation } }`
**Error (404):** `{ "message": "Job not found" }`

### 19. Start an Application

**POST** `/api/applications/:jobId`

Enqueues the Playwright apply worker for this job (`apply:prepare`), and also
creates/updates a `TrackedJob` row for the authenticated user so it shows up
on their Applied Jobs page. `applications` itself is a global, job-keyed
automation record (see the README's Database Design section) — ownership for
subsequent actions on it is derived through the caller's own `TrackedJob`.

**Response (202):**

```json
{ "status": "queued", "jobId": 101, "trackedJobId": 57 }
```

### 20. List Applications

**GET** `/api/applications?status=pending_review`

Returns only the engine applications whose underlying job the authenticated
user has actually tracked/applied to (via their own `TrackedJob` rows) — not
every user's applications.

**Response (200):**

```json
{
  "data": [
    {
      "id": 5,
      "job_id": 101,
      "status": "pending_review",
      "jobs": { "title": "Backend Engineer", "source_url": "https://...", "companies": { "name": "Acme Inc" } }
    }
  ]
}
```

### 21. Confirm Manual Submit

**POST** `/api/applications/:id/submit`

Called once the user has manually clicked submit in the Playwright-driven
session. Ownership-checked (404, not 403, if the application isn't tied to
one of the caller's own tracked jobs — never confirms another user's
application id even exists). Also syncs the matching `TrackedJob.status` to
`Applied`.

**Response (200):**

```json
{ "status": "applied", "jobId": 101 }
```

### 22. Record an Outcome

**POST** `/api/applications/:id/outcome`

**Request Body:**

```json
{ "status": "interview" }
```

`status` must be one of `interview`, `rejected`, `offer`. Ownership-checked
the same way as `/submit`. Also mirrors the outcome onto the caller's
`TrackedJob.status` (Title-Case: `Interview`/`Rejected`/`Offer`) so Applied
Jobs and Analytics reflect it, and nudges the matching engine's per-skill
weights via the learning loop.

**Response (200):**

```json
{ "status": "updated" }
```

### 23. Analytics Summary (live, per-user)

**GET** `/api/analytics?range=30`

This is the endpoint the Analytics dashboard actually calls (`/api/analytics/metrics`
is an identical alias). Computed live, scoped to the authenticated user's own
`tracked_jobs` — never aggregates across users. `range` is a number of days
(default 30).

**Response (200):**

```json
{
  "meta": { "rangeDays": 30, "computedFrom": ["tracked_jobs.application_date", "tracked_jobs.status", "scoped to the authenticated user"] },
  "data": {
    "totalApplications": 10,
    "responseRatePct": 30.0,
    "conversionRate": {
      "appliedToInterviewPct": 20.0,
      "interviewToOfferPct": 50.0,
      "appliedToOfferPct": 10.0
    },
    "averageResponseTimeHours": null,
    "counts": { "responses": 3, "interviews": 2, "offers": 1 }
  }
}
```

`conversionRate` percentages are based on each application's *current*
status (not full stage history — see the README's Analytics section).
`averageResponseTimeHours` is always `null` — the schema has no reliable
stage-transition timestamp to compute it from, so it's intentionally left
unset rather than reporting an inaccurate number. A denominator of zero
renders as `null` here (shown as `—` in the UI), never `0`.

### 24. Analytics Funnel (live, per-user)

**GET** `/api/analytics/funnel`

**Response (200):**

```json
{
  "data": {
    "scraped": 120,
    "matched": 8,
    "applied": 10,
    "interview": 2,
    "offer": 1
  }
}
```

`scraped` is a genuinely global count (the whole shared `jobs` catalog —
every user sees the same underlying discovery data). `matched` is scoped to
jobs matched against the authenticated user's own profile
(`match_scores.profile_id -> user_profile.user_id`). `applied`/`interview`/
`offer` come from the user's own `tracked_jobs`.

### 25. Legacy Analytics Snapshot (not used by the frontend)

**GET** `/api/analytics/summary?range=30`

A separate, older endpoint reading from the `analytics_daily` rollup table
(populated by a scheduled worker, `workers/analyticsWorker.js`). Still
mounted and functional, but **the current frontend does not call this
endpoint** — it's kept for any external tooling that might still expect the
precomputed-rollup shape. `analytics_daily` itself has no per-user dimension
(it's a genuinely system-wide daily aggregate), unlike endpoint 23 above.

**Response (200):**

```json
{
  "data": {
    "jobs_scraped": 120,
    "jobs_matched": 34,
    "applications_sent": 18,
    "responses": 5,
    "response_rate_pct": 27.8
  },
  "meta": { "rangeDays": 30 }
}
```

### 26. Get Profile

**GET** `/api/profile`

Returns the authenticated user's own resume/skills profile.

**Response (200):** `{ "data": { ...user_profile row for this user, or null if they haven't created one } }`

### 27. Create/Update Profile

**POST** `/api/profile`

**Request Body:**

```json
{
  "fullName": "Jane Doe",
  "email": "jane@example.com",
  "resumeText": "...",
  "skills": ["react", "node.js", "postgresql"],
  "experienceYears": 3
}
```

Creates or updates the authenticated user's own profile row — every user has
their own; profiles are not shared.

**Response:** `201 { "status": "created" }` on first save, or
`200 { "status": "updated" }` on subsequent saves.

### 28. List Companies

**GET** `/api/companies?search=acme&page=1&pageSize=25`

Browses the `companies` table (deduped employers discovered by the
ingestion pipeline — shared/global, not per-user), with a job count per
company. `search` matches against name or domain (case-insensitive).

**Response (200):**

```json
{
  "data": [
    {
      "id": 1,
      "name": "Acme Inc",
      "normalizedName": "acme-inc",
      "domain": "acme.com",
      "createdAt": "2026-06-01T00:00:00.000Z",
      "jobCount": 12
    }
  ],
  "meta": { "page": 1, "pageSize": 25, "total": 40 }
}
```

### 29. Get a Single Company

**GET** `/api/companies/:id`

**Response (200):** `{ "data": { ...company row, "jobs": [ ...up to 25 recent jobs ] } }`
**Error (404):** `{ "message": "Company not found" }`

### 30. List Job Sources

**GET** `/api/sources`

Browses the `job_sources` table (shared/global — `manual`, `linkedin`,
`indeed`, `remotive`, `gmail`, `extension`), with a job count per source.
`linkedin`/`indeed`/`remotive` are treated as "global engine source" counts
(jobs ingested by Job Discovery); their job counts reflect the whole shared
catalog, same as before — this endpoint doesn't expose per-user data.

**Response (200):**

```json
{
  "data": [
    { "id": 1, "name": "remotive", "baseUrl": "https://remotive.com", "createdAt": "2026-05-01T00:00:00.000Z", "jobCount": 84 },
    { "id": 2, "name": "linkedin", "baseUrl": "https://www.linkedin.com", "createdAt": "2026-05-01T00:00:00.000Z", "jobCount": 0 }
  ]
}
```

### 31. Get a Single Source

**GET** `/api/sources/:id`

**Response (200):** `{ "data": { ...source row, "jobs": [ ...up to 25 recent jobs ] } }`
**Error (404):** `{ "message": "Source not found" }`

---

## 📱 Mobile Sessions, Account & Notifications Endpoints

*(Added for the mobile production release.)*

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | /api/auth/login | – | Send header `X-Client: mobile` (or body `client: "mobile"`) to receive `{ accessToken, accessTokenExpiresAt, expiresIn, refreshToken, user }` (15-min access token). Web/extension unchanged (7-day `token`). |
| POST | /api/auth/refresh | – | `{ refreshToken }` -> new access token + **rotated** refresh token. 401 `session_invalid` = sign in again; 401 `refresh_in_progress` = benign race. Rate limited. |
| GET | /api/auth/me | token | Current user + `gmailConnected`. 401 on missing/expired/invalid token. |
| POST | /api/auth/logout | – | `{ refreshToken }` revokes that session family. Idempotent. |
| POST | /api/auth/logout-all | token | Revokes every mobile session. Also triggered by a password reset. |
| DELETE | /api/auth/account | token | `{ password }` permanently deletes the account and all its data (cascade) and revokes the Gmail grant. |
| POST/DELETE | /api/notifications/devices | token | Register / remove an Expo push token `{ expoPushToken, platform, deviceName, appVersion, timezone }`. |
| GET/PUT | /api/notifications/preferences | token | `{ pushEnabled, interviewReminders, applicationReminders, jobReminders, timezone, reminderHour }`. |
| POST | /api/notifications/test | token | Sends a test push to the caller's devices. |
| POST | /api/notifications/run-reminders | `x-cron-secret` | Runs one reminder pass (for external schedulers). 404 unless `CRON_SECRET` is set. |
| GET | /.well-known/assetlinks.json, /.well-known/apple-app-site-association | – | Verified deep links; served only when the env vars in server/.env.example are set. |
| GET | /app/reset-password?token= | – | Universal/App Link target; falls back to the web reset page when the app is not installed. |

Invalid or expired tokens now return **401** (previously 400 for an invalid token).

---

## Status Codes Reference

| Code | Meaning                                                          |
| ---- | ---------------------------------------------------------------- |
| 200  | OK - Successful request                                          |
| 201  | Created - Resource created successfully                          |
| 202  | Accepted - Work enqueued (discovery run, apply engine)           |
| 400  | Bad Request - Invalid input                                      |
| 401  | Unauthorized - Missing/invalid token                             |
| 404  | Not Found - Resource not found (or not owned by the caller)      |
| 429  | Too Many Requests - Discovery run rate limit exceeded            |
| 500  | Server Error - Internal server error                             |

---

## Common Errors

### Missing Token

```json
{ "message": "No token, authorization denied" }
```

### Invalid Token

```json
{ "message": "Token is not valid" }
```

### CORS Rejection

Requests from an origin not in `CLIENT_URL` (and not a `chrome-extension://`
origin) are rejected by the CORS middleware and surfaced via the server's
catch-all JSON error handler:

```json
{ "message": "Not allowed by CORS" }
```

---

## Example cURL Requests

### Register

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "SecurePass123"
  }'
```

### Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123"
  }'
```

### Create Job

```bash
curl -X POST http://localhost:5000/api/jobs \
  -H "token: <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "company": "Tech Corp",
    "role": "Frontend Developer",
    "status": "Applied"
  }'
```

### Get All Jobs

```bash
curl -X GET http://localhost:5000/api/jobs \
  -H "token: <your_token>"
```

### Start a Discovery Run (Remotive, LinkedIn, or Indeed)

```bash
curl -X POST http://localhost:5000/api/scrape/run \
  -H "token: <your_token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "backend engineer", "location": "India", "sources": ["linkedin", "indeed", "remotive"], "limit": 25}'
```

### Poll a Run

```bash
curl -X GET http://localhost:5000/api/scrape/runs/14 \
  -H "token: <your_token>"
```

---

## Rate Limiting

Job Discovery is rate-limited to 6 runs per hour per user (see endpoint 12,
above). The engine's Playwright apply worker separately rate-limits itself
per target domain via a Redis-backed token bucket (see
`services/rateLimiter.js`) — an internal safeguard, not a client-facing API
limit. No other endpoint in this API is rate-limited.

> **Cross-reference:** the mobile production release additionally documents rate limiting on login/register/forgot/reset/refresh (see `07`), while the final QA report (`10`, §10 item 2) records no rate limiting on `/api/auth/login` or `/api/auth/forgot-password`.

---

## Versioning

**Base URL**: `/api` (no version prefix currently in use)
