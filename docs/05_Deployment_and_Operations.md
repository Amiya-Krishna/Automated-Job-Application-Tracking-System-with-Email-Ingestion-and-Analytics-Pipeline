# 05 — Deployment and Operations

## 1. Topology

| Component | Typical host | Notes |
|---|---|---|
| API (`server.js`) | Any Node 22 host (the reference deployment uses Render) | Stateless; scale horizontally once rate limiting is moved to a shared store |
| Worker (`worker.js`) | Same repository, separate process | Needs Redis and Playwright Chromium; scale per queue |
| PostgreSQL | Managed Postgres | Source of truth; schema applied with `prisma migrate deploy` |
| Redis | Managed Redis (persistence/AOF recommended) | BullMQ queues; without it discovery, matching, apply and analytics jobs never run |
| Web app | Static host (the reference deployment uses Vercel) | `client/vercel.json` rewrites `/api/*` to the API origin, so the browser sees one origin |
| Mobile | EAS Build / EAS Update | `.github/workflows/mobile-release.yml` |
| Reminders | In-process scheduler, or GitHub Actions cron | See §5 |

## 2. Release checklist (API + worker)

1. Set the environment ([docs/03 §4](03_Setup_Installation_and_Contributing.md)). In production `CLIENT_URL` is mandatory and `NODE_ENV=production`.
2. Build step: `npm ci && npx prisma generate` (`npm run build` does the generate).
3. Release step, before starting the new version: `npx prisma migrate deploy` (`npm run release`). Never `migrate dev`.
4. Start the API (`npm start`) and the worker (`npm run worker`).
5. Check `GET /health` → `{"status":"ok"}`, then the boot log: `[schema-check]` messages mean a missing `prisma generate` or an unapplied migration (they log; they do not crash the process).
6. Create or confirm an administrator (`npm run make-admin -- you@example.com`).

Migrations are additive and idempotent, so old and new API versions can overlap during a rolling deploy.

## 3. Configuration that matters in production

| Concern | Setting |
|---|---|
| CORS | `CLIENT_URL` lists the exact HTTPS web origins; mobile and the extension are not browser-origin dependent |
| Cookies | Web refresh cookie is `HttpOnly`, `Secure`, `SameSite=None` when served over HTTPS (cross-site API) |
| Proxy | `trust proxy` is set so rate limits see client IPs behind the host's proxy |
| Secrets | `JWT_SECRET`, Google, Resend, LLM and Expo keys only in the host's secret store |
| Error exposure | `NODE_ENV=production` replaces every 5xx body with a generic message |
| Session lifetime | `ACCESS_TOKEN_TTL_SECONDS` (900), `REFRESH_TOKEN_TTL_DAYS` (60); expired sessions are purged at boot |
| Redis | Enable persistence so queued jobs survive restarts |
| Playwright | Install Chromium on the worker host only |

## 4. Operations

- **Logs**: structured by prefix (`[auth]`, `[admin-audit]`, `[schema-check]`, `[ingestWorker]`). Request bodies, tokens and error messages that may echo user data are not logged; only error classes/codes are. Admin block/unblock/delete actions write an `[admin-audit] admin#<id> <action> user#<id>` line.
- **Queues**: BullMQ keeps failed jobs (`removeOnFail: false`) for inspection and retry. Ingest retries 5 times with exponential backoff.
- **Worker down**: discovery runs stay `queued`; the UI says so after 45 s. Nothing is lost; runs proceed when a worker starts.
- **Account actions**: block is the reversible first response to abuse; delete is permanent ([docs/11](11_Roles_Permissions_Platforms_and_Release_Notes.md)).
- **Backups**: rely on the managed database's backups; account deletion is irreversible by design.

## 5. Reminders and push

Reminders run via an in-process scheduler (`REMINDERS_ENABLED`, `REMINDER_INTERVAL_MINUTES`). On hosts that sleep when idle, set `REMINDERS_ENABLED=false`, set `CRON_SECRET`, and let `.github/workflows/reminders-cron.yml` call `POST /api/notifications/run-reminders` every 15 minutes (repository secrets `API_URL` and `CRON_SECRET`; the workflow skips itself when they are absent). Sends are exactly-once per user and reminder through a unique key, so two instances or overlapping runs cannot double-notify.

## 6. CI/CD

`.github/workflows/ci.yml` runs on every pull request and push to `main` that touches code:

| Job | Steps |
|---|---|
| web | lint, tests, production build |
| server | `prisma generate`, all tests with a PostgreSQL 16 service (`TEST_DATABASE_URL`) so migration-chain, account and ownership tests run |
| mobile | lint, typecheck, tests, `expo config` for staging and production |
| extension | tests |

`mobile-release.yml` publishes a staging OTA update on push and runs EAS build/submit on manual dispatch, behind the protected `production` environment. Mobile OTA uses `expo-updates` with the `appVersion` runtime policy.

## 7. Scaling notes (what is true today)

- API instances are stateless apart from rate-limit counters (per process). To run several instances, move the limiter to Redis.
- Workers scale independently by queue; Playwright (CPU and memory heavy) is the first bottleneck.
- Per-request cost of authentication is one primary-key lookup; ownership columns are indexed.
- Analytics are computed live per user. That is cheap for personal-sized data; at much larger scale, add caching or per-user rollups.
- No load testing has been performed; this document makes no throughput claims.
