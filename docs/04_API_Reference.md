# 04 — API Reference

Base URL: the API origin (for example `https://api.example.com`); all routes below are under `/api`. JSON in, JSON out.

## Conventions

| Topic | Rule |
|---|---|
| Authentication | `token: <access JWT>` header (or `Authorization: Bearer <jwt>`). Web also sends `x-client: web` and an HttpOnly refresh cookie; mobile sends `x-client: mobile`; the extension `x-client: extension`. |
| Error body | `{ "message": "...", "code": "..." }`. `code` is present for conditions clients branch on. In production every `5xx` message is replaced by a generic one. |
| Auth failures | `401` `no_token` / `token_expired` / `token_invalid` (sign in again or refresh); `403 account_blocked`; `403 admin_required`. |
| Ownership | Every per-user route is scoped to the caller. Another user's id returns `404`, never `403`, so ids cannot be probed. |
| Rate limiting | `429 { code: "rate_limited", retryAfterSeconds }` with a `Retry-After` header. Limits are per process. |
| IDs | Integers (jobs/companies expose Postgres `BIGINT` as numbers/strings as documented per client). |

Legend: 🔓 public · 🔑 any signed-in, active user · 🛡 admin only.

## 1. Auth — `/api/auth`

| Method & path | Access | Purpose |
|---|---|---|
| `POST /register` | 🔓 | `{ name, email, password (6–200) }` → `201`. Never accepts a role. `400` if the email exists. |
| `POST /login` | 🔓 | `{ email, password, role?: "user"\|"admin", rememberMe? }`. Mobile/extension: `{ token, accessToken, accessTokenExpiresAt, expiresIn, refreshToken, user }`. Web: same without `refreshToken` (cookie set). Legacy: `{ token (7d), user }`. `403 account_blocked`; `403 admin_required` when the admin door is used by a non-admin. The admin door has a tighter rate limit and generic errors. |
| `POST /refresh` | 🔓 | Rotates the refresh token (body `refreshToken`, or cookie for web). `401 session_invalid`, `401 refresh_in_progress` (retry with the token you already have), `403 account_blocked`. |
| `GET /me` | 🔑 | `{ user: { id, name, email, role, gmailConnected, createdAt } }`. |
| `POST /logout` | 🔓 | Revokes the refresh-token family; idempotent. |
| `POST /logout-all` | 🔑 | Revokes every session of the caller. |
| `DELETE /account` | 🔑 | Self-delete. Body `{ password }`. `400` wrong password · `403 account_blocked` · `409 last_admin` · `429`. See [docs/11](11_Roles_Permissions_Platforms_and_Release_Notes.md). |
| `POST /forgot-password` | 🔓 | `{ email, source?: "mobile"\|"extension", redirectUri? }`. Always the same response, whether or not the account exists. Mobile must supply an allow-listed deep link. |
| `POST /reset-password` | 🔓 | `{ token, password }`. The link is single-use and ends all sessions and earlier tokens. |

## 2. Tracked jobs — `/api/jobs` (🔑)

| Method & path | Purpose |
|---|---|
| `POST /` | Create a tracked job (`company`, `role` required; optional status, dates, notes, `sourceUrl`, description, location, `salaryText`, `skills`, `sourceName`, `platform`). Origin is decided server-side. A duplicate (same user + external id or URL) is merged and returned with `duplicate: true`. |
| `GET /` | The caller's tracked jobs, newest first. |
| `GET /applied` | Unified Applied Jobs view (tracked jobs + engine applications tied to the caller's own tracked jobs). |
| `PUT /:id` · `DELETE /:id` | Update / delete one of the caller's jobs (`404` otherwise). |

`POST /api/ingest` (🔑) — extension capture: `{ title, company, description, sourceName, sourceUrl, ... }` → queued (`202`) with a deterministic queue id. Can only create the caller's **private** job.

## 3. Catalog — `/api/engine/jobs`, `/api/companies`, `/api/sources` (🔑)

| Method & path | Notes |
|---|---|
| `GET /api/engine/jobs?status=&minScore=&page=&pageSize=` | Jobs the caller may see (global + own private) with the caller's match score. |
| `GET /api/engine/jobs/:id` | One visible job; `404` if private to someone else. |
| `GET /api/companies?search=&page=&pageSize=` · `GET /api/companies/:id` | Companies visible to the caller, with job counts limited to visible jobs. |
| `GET /api/sources` · `GET /api/sources/:id` | Audience decided by the database role: users get Manual/Gmail/Extension (own data); admins get the seven fetched sources. A source of the other audience is `404`. |

## 4. Apply engine — `/api/applications` (🔑)

| Method & path | Purpose |
|---|---|
| `POST /:jobId` | Queue preparation for a job the caller can see; creates/updates the caller's tracked job. Idempotent. |
| `GET /?status=` | Engine applications tied to the caller's tracked jobs. |
| `POST /:id/submit` | The user confirms they submitted (the engine never submits). |
| `POST /:id/outcome` | `{ status }` records interview / offer / rejected and feeds the learning loop. |

## 5. Profile, analytics

| Method & path | Access | Purpose |
|---|---|---|
| `GET /api/profile` · `POST /api/profile` | 🔑 | The caller's matching profile (name/email fall back to the account). |
| `GET /api/analytics` · `/metrics` · `/funnel` (`?range=days`) | 🔑 | Per-user numbers computed live from the caller's tracked jobs. |
| `GET /api/analytics/summary` | 🛡 | System-wide summary. |

## 6. Gmail — `/api/gmail`

| Method & path | Access | Purpose |
|---|---|---|
| `GET /auth-url?source=web\|extension\|mobile&redirectUri=&returnTo=` | 🔑 | Returns the Google consent URL. The redirect is signed into a short-lived `state` token and validated against an allow-list (no open redirect). |
| `GET /callback` | 🔓 (signed `state`) | OAuth callback. Saves the refresh token only for an **active** account named by the state. |
| `GET /status` · `POST /disconnect` | 🔑 | Connection state; revoke and remove the stored grant. |
| `GET /scan?days=1–365&limit=1–50` | 🔑 | Read-only (`gmail.readonly`) metadata scan; returns relevance-scored job mail with suggested company/role/status. |
| `POST /import` | 🔑 | Adds a scanned email as a private tracked job. |

## 7. Resume tailoring — `/api/resume` (🔑)

Documented in [docs/09](09_Gmail_Integration_and_Resume_Tailoring.md): `GET /current`, `POST /upload` (PDF/DOCX ≤ 2 MB), `GET /resumes`, `GET /resumes/:id`, `POST /resumes/:id/activate`, `DELETE /resumes/:id`, `GET /original/file`, `POST /analyze`, `POST /tailor`, `GET /sessions/:id`, `GET /tailored/:id`, `GET /versions`, `GET /match-analysis/:jobId`, `POST /versions/:id/preview|approve|export`. Typical errors: `no_resume`, `jd_too_short`, `resume_unreadable`, `rate_limited`, `session_in_progress`.

## 8. Notifications — `/api/notifications` (🔑)

| Method & path | Purpose |
|---|---|
| `GET /inbox?limit=&unread=true` · `GET /inbox/unread-count` | The caller's in-app inbox. |
| `POST /inbox` · `POST /inbox/read-all` · `POST /inbox/:id/read` · `DELETE /inbox/:id` · `DELETE /inbox` | Create-for-self, mark read, delete, clear. Foreign ids are `404`. |
| `POST /devices` · `DELETE /devices` | Register / remove an Expo push token (`expoPushToken`, platform, timezone). |
| `GET /preferences` · `PUT /preferences` | Push and reminder settings, timezone, reminder hour. |
| `POST /test` | Send a test push to the caller's devices. |
| `POST /run-reminders` | Cron only: `x-cron-secret` header; `404` when `CRON_SECRET` is unset. |

## 9. Discovery — `/api/scrape` (🛡)

| Method & path | Purpose |
|---|---|
| `GET /platforms` | Available sources. |
| `POST /run` | `{ query, location?, sources[], limit (1–50) }` → `202 { runId, status: "queued" }`. |
| `GET /runs/:id` · `GET /runs` · `DELETE /runs/:id` | Poll a run (`no-store`), list history, delete one's own run. Per-source results: `ok` / `error` / `blocked` / `unavailable`. |

## 10. Admin — `/api/admin` (🛡)

| Method & path | Purpose |
|---|---|
| `GET /overview` | Counts: users, admins, blocked users, global jobs, companies, sources, discovery runs. |
| `GET /users?q=&status=&role=&page=&pageSize=` | Paged user list (no secrets). |
| `POST /users/:id/block` · `POST /users/:id/unblock` | Reversible account block. |
| `DELETE /users/:id` | Permanent deletion of a normal user. |
| `PATCH /users/:id/role` | `{ role: "admin"\|"user" }`; not your own. |
| `DELETE /jobs/:id` · `/companies/:id?withJobs=` · `/sources/:id?withJobs=` | Catalog deletion; `409` when in use or in flight. |

Error codes for user actions: `cannot_modify_self` (400), `cannot_manage_admin` (403), `last_admin` (409), `account_blocked` (403), `admin_required` (403).

## 11. Public and platform routes

`GET /.well-known/assetlinks.json`, `GET /.well-known/apple-app-site-association` (mobile app links, from environment configuration), `GET /app/reset-password` (app-link landing), static `/legal/*` pages (privacy, terms, delete-account) and `/extension/gmail-success.html`.
