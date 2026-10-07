# TrackTrail API and Workers

The backend is the core of TrackTrail: an Express 5 REST API backed by PostgreSQL/Prisma, with Redis + BullMQ workers for asynchronous ingestion, discovery, matching, application preparation and analytics.

For the system-level design, see [`docs/01`](../docs/01_Project_Structure_and_Architecture.md). For endpoints, see [`docs/04`](../docs/04_API_Reference.md).

## Responsibilities

- Authentication and rotating sessions.
- User/admin authorization.
- Global/private data visibility enforcement.
- Job ingestion and de-duplication.
- Multi-source discovery.
- Explainable job matching.
- Human-in-the-loop application preparation.
- Gmail ingestion.
- Resume management and evidence-constrained tailoring.
- Analytics and reminders.
- Account blocking, deletion and catalog administration.

## Processes

| Process | Entry point | Role |
|---|---|---|
| API | `server.js` | Auth, validation, synchronous reads/writes, queue submission |
| Worker | `worker.js` | BullMQ consumers for ingest, match, scrape, apply and analytics |

The separation is deliberate: scraping and browser automation are slow and failure-prone. They should not determine request latency or bring the API process down.

## Key directories

| Directory | Purpose |
|---|---|
| `routes/` | 15 route modules |
| `middleware/` | Authentication, admin authorization, rate limiting, CORS |
| `lib/` | Prisma, sessions, account status and schema checks |
| `services/` | Ingestion, deduplication, matching, learning, reminders, push, account management, resume tailoring and discovery |
| `adapters/` | Job-source adapters |
| `workers/` | BullMQ worker implementations |
| `queue/` | Queue definitions |
| `prisma/` | Prisma schema and 9 SQL migrations |
| `tests/` | 311 server tests |

## Local setup

```bash
npm ci
cp .env.example .env
npx prisma generate
npx prisma migrate deploy

npm start
npm run worker
npm run make-admin -- you@example.com
npm test
```

For the real PostgreSQL tests, set `TEST_DATABASE_URL`.

The worker requires Redis. Discovery/apply features also require the Playwright Chromium runtime.

## Security model

- Passwords use bcrypt.
- Access tokens are short-lived.
- Refresh tokens are opaque, rotated and stored only as hashes.
- Account status and token version are checked from the database on each authenticated request.
- Admin routes require server-side admin authorization.
- Per-user resources are scoped to `req.user.id`.
- Shared catalog visibility goes through `services/visibility.js`.
- Production 5xx responses are sanitized.
- Sensitive routes are rate-limited.

## Engineering invariants

Contributors should preserve these rules:

1. A client must never be able to create a global job.
2. Shared-table reads must use the visibility rules.
3. Per-user queries must scope by the authenticated user.
4. User-owned records must cascade correctly on account deletion.
5. Migrations must remain additive and idempotent.
6. Tokens, credentials and sensitive request bodies must not be logged.

See [`docs/03`](../docs/03_Setup_Installation_and_Contributing.md) before changing the development workflow.
