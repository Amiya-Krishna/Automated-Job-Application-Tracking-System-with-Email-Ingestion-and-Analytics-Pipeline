# 01 — Architecture, Data Model and Security Design

## 1. System overview

```
 Web (React 19)   Mobile (Expo 57)   Chrome extension (MV3)   Admin console (inside the web app)
        \               |                   |                        /
         +--------------+---- REST API (Express 5, server.js) -------+
                         security headers · CORS allow-list · JSON
                         auth middleware · requireAdmin · rate limiters
                                      |
                   +------------------+---------------------+
                   |                                        |
        PostgreSQL via Prisma + pg                  Redis + BullMQ (worker.js)
        (migrations, triggers, indexes)             queues: ingest · match · scrape · apply · analytics
                                                                |
                                         Playwright (discovery, apply engine) · Gmail API · Expo push · optional LLM
```

Two processes are deployed from `server/`:

| Process | Entry | Responsibility |
|---|---|---|
| API | `server.js` | Authentication, validation, thin reads/writes, enqueueing. Never scrapes, scores or drives a browser inline. |
| Worker | `worker.js` | BullMQ consumers: `ingestWorker`, `matchWorker`, `scrapeWorker`, `applyWorker`, `analyticsWorker`. |

Why they are separate: scraping and browser automation take seconds to minutes and fail in ways a request/response path should not absorb (timeouts, markup drift, CAPTCHAs). Separation keeps API latency independent of them, lets each side restart on its own, and lets workers scale per queue.

## 2. Repository layout

```
server/
  server.js, worker.js          process entry points
  routes/                       15 route modules (auth, admin, jobs, gmail, resume, scrape, ...)
  middleware/                   authMiddleware, requireAdmin, rateLimit, corsOptions
  lib/                          prisma client, sessions (refresh tokens), accountStatus, schemaCheck
  services/                     ingestion, dedup, matching, learning, reminders, push, account deletion,
                                catalog deletion, visibility rules, resumeTailoring/, jobBoards/, jobDiscovery/
  adapters/                     one adapter per job source + shared factory
  workers/                      BullMQ workers
  prisma/                       schema.prisma + migrations/ (9)
  tests/                        311 tests (accounts, admin, auth, isolation, jobs, notifications, resumeTailoring, ...)
client/                         React 19 + Vite + Tailwind + Recharts web app and admin console
mobile/                         Expo Router app (TypeScript strict, TanStack Query)
browser-extension/              Manifest V3 extension (service worker, content scripts, popup, dashboard)
```

## 3. Data model

PostgreSQL is the source of truth. 22 Prisma models (`server/prisma/schema.prisma`) fall into two ownership classes.

**Shared catalog (global, no user foreign key)**

| Table | Notes |
|---|---|
| `jobs` | Canonical job rows. `content_hash` (exact-duplicate lookup), `canonical_job_id` self-reference (a duplicate points at the original; a new job points at itself), `owner_user_id` (NULL = global, set = private). |
| `companies` | Unique on `normalized_name`; created with an atomic `INSERT ... ON CONFLICT` so concurrent ingests cannot fail on a race. |
| `job_sources` | `scope` is `global` (admin-fetched) or `private` (manual / gmail / extension). |
| `applications`, `analytics_daily` | The apply engine's per-job record and a system-wide rollup. |

**Per-user (every row reachable only through `user_id`, all `ON DELETE CASCADE` from `users`)**

`tracked_jobs`, `user_profile` (+ `match_scores` through the profile), `scrape_runs`, `resumes` / `resume_facts` / `job_descriptions` / `resume_analyses` / `resume_versions` / `resume_changes` / `tailoring_sessions`, `user_sessions`, `push_devices`, `notification_preferences`, `notification_log`, `notifications`, and private `jobs` (`owner_user_id`).

`users` carries `role` (`user` | `admin`), `status` (`ACTIVE` | `BLOCKED`, CHECK-constrained), `blocked_at` and `token_version`.

### Integrity rules enforced by the database

| Rule | Mechanism (migration) |
|---|---|
| A job from a private source must have an owner; a job from a global source must not; an owner can never change | `enforce_job_scope` trigger (`20261004000000`) |
| De-duplication keys differ for global and private rows | Two partial unique indexes: `(source_id, external_job_id) WHERE owner_user_id IS NULL` and `(owner_user_id, source_id, external_job_id) WHERE owner_user_id IS NOT NULL` |
| One tracked job per (user, engine job) | `uq_tracked_jobs_user_engine_job` (`20260823000000`) |
| Notifications exactly-once per user | Unique `(user_id, dedupe_key)` indexes |
| Account status is one of two values | `users_status_check` (`20261006000000`) |
| Deleting a user leaves no orphans | All user-owned FKs cascade, including `match_scores.profile_id` (`20261006000000`); the shared catalog keeps `NO ACTION` so it can never be cascaded away |

### Migrations

`server/prisma/migrations/` contains nine migrations, starting with an idempotent **baseline** (`20260801000000_baseline_core_tables`) so an empty database can be built from the repository alone. Every migration is written to be re-runnable (`IF NOT EXISTS`, guarded `DO` blocks). A test (`tests/accounts/migrationChain.test.js`, real PostgreSQL) applies the whole chain twice to an empty database and compares tables, columns, types, nullability, named indexes and delete rules against `schema.prisma`. Apply in production with `npx prisma migrate deploy` (never `migrate dev`).

## 4. Authentication and sessions

| Client | Access token | Refresh token |
|---|---|---|
| Web | 15-minute JWT, held in memory only | Opaque, HttpOnly `Secure` cookie scoped to `/api/auth` |
| Mobile | 15-minute JWT | Opaque, stored in the OS keystore (Keychain / Android Keystore), returned in the JSON body |
| Extension | 15-minute JWT | Opaque, same contract as mobile |
| Legacy header client | 7-day JWT (no `x-client` header) | none |

- Passwords: bcrypt. Login errors are generic for mobile and the admin door (no account enumeration).
- Refresh tokens are 256-bit random values; only their SHA-256 hash is stored (`user_sessions`). Every refresh **rotates** the token; presenting an already-rotated token (after a 10-second grace window for lost responses) revokes the whole rotation family.
- `authMiddleware` accepts only real session tokens (purpose tokens such as password-reset and OAuth `state` are rejected) and then **reads the account from the database on every request**:

| Account state | Result |
|---|---|
| Deleted | `401 token_invalid` |
| Blocked | `403 account_blocked` |
| Token version mismatch (`tv` ≠ `users.token_version`) | `401 token_invalid` |
| Lookup error | `500` (fails closed) |

Blocking increments `token_version` and revokes all sessions in one transaction, so tokens issued before the block stay dead even after an unblock. A password reset also increments it.

## 5. Authorization

- `requireAdmin` re-reads `role` and `status` from the database per request; nothing the client sends is consulted. Admin routers (`/api/admin`, `/api/scrape`) are mounted behind `auth` **and** `requireAdmin` in `server.js`, so a handler cannot forget the check.
- Per-user routes scope every query by `req.user.id`; foreign ids yield `404`.
- Shared-table reads go through `services/visibility.js` (`visibleJobsWhere`, `visibleJobSql`). Admins get no exception to private-job visibility.
- `/api/ingest` is mounted behind `auth` only and can never create a global job; a client-supplied `source` is re-classified (`normalizeOrigin`).

## 6. Account lifecycle

See [docs/11](11_Roles_Permissions_Platforms_and_Release_Notes.md) for the full rules, error codes and the deletion data map.

## 7. Defensive defaults

- Security headers on every response (`nosniff`, `X-Frame-Options: DENY`, CSP `default-src 'self'`, HSTS in production); `x-powered-by` disabled; `trust proxy` set for correct client IPs.
- CORS allow-list from `CLIENT_URL` (required in production); disallowed origins receive `403` and no CORS headers.
- In production every 5xx body is replaced with a generic message and only method/path/status are logged.
- Rate limiting (`middleware/rateLimit.js`): sliding window per user or IP on login (stricter for the admin door), registration, forgot/reset password, refresh, account deletion and the costly resume endpoints. Counters are per process.
- Uploads: memory storage, 2 MB limit, single file; type and structure validated server-side.
- Cron endpoint `POST /api/notifications/run-reminders` requires `CRON_SECRET` (constant-time comparison) and is `404` when unset.

## 8. Request flow for a captured job

1. A client calls `POST /api/jobs` (tracker) or `POST /api/ingest` (extension). The origin is decided server-side.
2. `ingestJob` normalises the payload, upserts the company atomically, computes `content_hash`.
3. Exact-duplicate check, then a fuzzy check (title Jaro-Winkler + description TF-IDF cosine, threshold 0.85) against the same company within ±14 days. Duplicates point at the canonical row.
4. A new job is inserted with a canonical id and a `match:score` message is enqueued.
5. `matchWorker` scores the job against the owner's profile (global jobs: against profiles that need it) and stores score + explanation; ≥ 70 marks the job `matched`.
6. Outcomes recorded later adjust per-skill weights (`learningService`), bounded to [0.1, 3.0].

Queue retries use exponential backoff (ingest: 5 attempts). A job queued for a user who is deleted before it runs fails on the foreign key after its retries and is parked in BullMQ's failed set; no data is created.
