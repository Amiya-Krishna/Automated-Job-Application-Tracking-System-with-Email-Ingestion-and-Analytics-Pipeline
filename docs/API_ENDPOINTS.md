# API Endpoints Documentation

Complete reference for all Job Application Tracker Portal API endpoints.

---

## Base URL

```
http://localhost:5000/api
```

In production this is whatever host you deploy the server to (e.g.
`https://Automated-Job-Application-Tracking-System-with-Email-Ingestion-and-Analytics-Pipeline-o1ls.onrender.com/api`).

---

## Authentication

Protected endpoints require a JWT, sent as a plain **`token`** request header
(not the `Authorization: Bearer` convention):

```
token: <your_jwt_token>
```

The token is returned by `POST /api/auth/login` and doesn't currently carry an
expiry — it's valid until your `JWT_SECRET` changes.

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

> There is no `/logout` or `/profile` endpoint — logout is handled entirely on
> the frontend by discarding the stored token.

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

See [GMAIL_INTEGRATION.md](GMAIL_INTEGRATION.md) for the full OAuth setup.
All endpoints below require the `token` header unless noted.

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

## 🤖 Intelligent Job Application Engine

These endpoints back the scraping/matching/apply/analytics engine described
in [intelligent-job-application-engine-design.md](intelligent-job-application-engine-design.md).
They read/write the Postgres `jobs`, `companies`, `job_sources`,
`applications`, `match_scores`, `user_profile`, and `analytics_daily` tables
— separate from the `tracked_jobs` table used by `/api/jobs` above. None of
these currently require the `token` auth header.

### 12. Ingest a Job

**POST** `/api/ingest`

Shared entrypoint used by both the Playwright scraper and the browser
extension's manual capture.

**Request Body:**

```json
{
  "title": "Backend Engineer",
  "company": "Acme Inc",
  "description": "Full job description text...",
  "location": "Remote",
  "remoteType": "remote",
  "sourceName": "linkedin",
  "sourceUrl": "https://www.linkedin.com/jobs/view/12345",
  "externalJobId": "12345",
  "postedAt": "2026-07-15T00:00:00.000Z"
}
```

`title`, `company`, `description`, `sourceName`, and `sourceUrl` are required.

**Response (201):** result of normalization/dedup/insert (job id, whether it
was a duplicate, etc. — see `services/ingestionService.js`).

### 13. Browse Engine Jobs

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

### 14. Get a Single Engine Job

**GET** `/api/engine/jobs/:id`

**Response (200):** `{ "data": { ...full job row, company, score, explanation } }`
**Error (404):** `{ "message": "Job not found" }`

### 15. Start an Application

**POST** `/api/applications/:jobId`

Enqueues the Playwright apply worker for this job (`apply:prepare`).

**Response (202):**

```json
{ "status": "queued", "jobId": 101 }
```

### 16. List Applications

**GET** `/api/applications?status=pending_review`

**Response (200):**

```json
{
  "data": [
    {
      "id": 5,
      "job_id": 101,
      "status": "pending_review",
      "title": "Backend Engineer",
      "source_url": "https://...",
      "company": "Acme Inc"
    }
  ]
}
```

### 17. Confirm Manual Submit

**POST** `/api/applications/:id/submit`

Called once the user has manually clicked submit in the Playwright-driven
session.

**Response (200):**

```json
{ "status": "applied" }
```

### 18. Record an Outcome

**POST** `/api/applications/:id/outcome`

**Request Body:**

```json
{ "status": "interview" }
```

`status` must be one of `interview`, `rejected`, `offer`. Also nudges the
matching engine's per-skill weights via the learning loop.

**Response (200):**

```json
{ "status": "updated" }
```

### 19. Analytics Summary

**GET** `/api/analytics/summary?range=30d`

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

### 20. Analytics Funnel

**GET** `/api/analytics/funnel`

**Response (200):**

```json
{
  "data": {
    "scraped": 120,
    "matched": 34,
    "applied": 18,
    "interview": 5,
    "offer": 1
  }
}
```

### 21. Get Profile

**GET** `/api/profile`

**Response (200):** `{ "data": { ...user_profile row, or null if none set } }`

### 22. Create/Update Profile

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

**Response:** `201 { "status": "created" }` on first save, or
`200 { "status": "updated" }` on subsequent saves — there's only ever one
profile row.

### 23. List Companies

**GET** `/api/companies?search=acme&page=1&pageSize=25`

Browses the `companies` table (deduped employers discovered by the
ingestion pipeline), with a job count per company. `search` matches
against name or domain (case-insensitive).

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

### 24. Get a Single Company

**GET** `/api/companies/:id`

**Response (200):** `{ "data": { ...company row, "jobs": [ ...up to 25 recent jobs ] } }`
**Error (404):** `{ "message": "Company not found" }`

### 25. List Job Sources

**GET** `/api/sources`

Browses the `job_sources` table (LinkedIn, Indeed, etc — everywhere the
scraper pulls listings from), with a job count per source.

**Response (200):**

```json
{
  "data": [
    { "id": 1, "name": "linkedin", "baseUrl": "https://www.linkedin.com", "createdAt": "2026-05-01T00:00:00.000Z", "jobCount": 84 }
  ]
}
```

### 26. Get a Single Source

**GET** `/api/sources/:id`

**Response (200):** `{ "data": { ...source row, "jobs": [ ...up to 25 recent jobs ] } }`
**Error (404):** `{ "message": "Source not found" }`

---

## Status Codes Reference

| Code | Meaning                                                          |
| ---- | ---------------------------------------------------------------- |
| 200  | OK - Successful request                                          |
| 201  | Created - Resource created successfully                          |
| 202  | Accepted - Work enqueued (apply engine)                          |
| 400  | Bad Request - Invalid input                                      |
| 401  | Unauthorized - Missing/invalid token (tracker/auth/gmail routes) |
| 404  | Not Found - Resource not found                                   |
| 500  | Server Error - Internal server error                             |

---

## Common Errors

### Missing Token (tracker/gmail routes)

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

### Seed an Engine Profile

```bash
curl -X POST http://localhost:5000/api/profile \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Your Name","email":"you@example.com","resumeText":"...","skills":["react","node.js","postgresql"]}'
```

---

## Rate Limiting

No rate limiting is enforced on the tracker/auth API. The engine's Playwright
scraper/apply worker does rate-limit itself per target domain via a
Redis-backed token bucket (see `services/rateLimiter.js`) — that's an
internal safeguard, not an API-level limit.

---

## Versioning

**Base URL**: `/api` (no version prefix currently in use)

---

**Last Updated**: July 20, 2026
