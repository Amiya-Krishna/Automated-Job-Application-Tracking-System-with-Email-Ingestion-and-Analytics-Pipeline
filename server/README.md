# TrackTrail API and Workers

Node.js 22, Express 5, PostgreSQL (Prisma), Redis + BullMQ, Playwright. Architecture, data model and security design: [docs/01](../docs/01_Project_Structure_and_Architecture.md). Endpoints: [docs/04](../docs/04_API_Reference.md).

```bash
npm ci
cp .env.example .env                 # DATABASE_URL, JWT_SECRET, CLIENT_URL at minimum
npx prisma generate
npx prisma migrate deploy            # builds the full schema from an empty database
npm start                            # API
npm run worker                       # BullMQ workers (needs REDIS_URL, Playwright Chromium for discovery/apply)
npm run make-admin -- you@example.com
npm test                             # add TEST_DATABASE_URL=postgres://... for the real-PostgreSQL tests
```

| Directory | Contents |
|---|---|
| `routes/` | 15 route modules; `server.js` mounts them (admin and discovery behind `auth` + `requireAdmin`) |
| `middleware/` | `authMiddleware` (per-request account check), `requireAdmin`, rate limiting, CORS |
| `lib/` | Prisma client, refresh-token sessions, account-status rules, boot-time schema checks |
| `services/` | Ingestion, de-duplication, matching, reminders, push, account/catalog deletion, visibility rules, resume tailoring, discovery |
| `workers/`, `queue/` | BullMQ workers and queues |
| `prisma/` | `schema.prisma` and nine idempotent migrations (starting with a baseline) |
| `tests/` | 311 tests: accounts, admin, auth, isolation, jobs, notifications, resume tailoring, discovery |

Rules for contributors: shared-table reads go through `services/visibility.js`; per-user queries filter on `req.user.id`; migrations are additive and idempotent; never log tokens, bodies or error messages that can echo user data. See [docs/03](../docs/03_Setup_Installation_and_Contributing.md).
