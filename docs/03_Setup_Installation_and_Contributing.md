# 03 — Setup, Configuration and Contributing

## 1. Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node.js | 22 (CI uses 22) | everything |
| PostgreSQL | 14+ (verified on 16) | API, tests marked "real PostgreSQL" |
| Redis | 6+ | the worker process (discovery, matching, apply, analytics) |
| Playwright Chromium | `npx playwright install chromium` | discovery and the apply engine (worker host only) |
| Expo tooling / Expo Go or a dev build | SDK 57 | mobile app |
| Chrome 102+ | | browser extension |

## 2. Server

```bash
cd server
npm ci
cp .env.example .env            # edit values (see §4)
npx prisma generate
npx prisma migrate deploy       # builds the whole schema from an empty database
npm start                       # API on $PORT (default 5000)
npm run worker                  # separate terminal: BullMQ workers (needs REDIS_URL)
```

- Use `npx prisma migrate deploy` for every environment, including local. `prisma migrate dev` is for authoring new migrations only and is refused in production by `scripts/refuseInProduction.js`.
- `npm run db:migrate` (`migrate.js`) is a legacy script from before Prisma and does not work; ignore it.
- First administrator: register the account in the app, then `npm run make-admin -- you@example.com` (add `--revoke` to demote). `ADMIN_EMAILS` also works at boot, but see the caveat in [docs/11](11_Roles_Permissions_Platforms_and_Release_Notes.md).

## 3. Clients

```bash
# Web (http://localhost:5173, proxies to http://localhost:5000/api in development)
cd client && npm ci && npm run dev

# Mobile
cd mobile && npm ci && cp .env.example .env     # set EXPO_PUBLIC_API_URL
npx expo start

# Extension: chrome://extensions → Developer mode → Load unpacked → select browser-extension/
```

Web: a deployed API URL in `.env` cannot override local development; set `VITE_USE_REMOTE_API=true` to do that on purpose. `client/.env.local.example` shows the local setup. Mobile `EXPO_PUBLIC_API_URL` has no trailing slash and no `/api`: `http://localhost:5000` (web target), `http://10.0.2.2:5000` (Android emulator), `http://<LAN-IP>:5000` (physical device).

## 4. Environment variables (`server/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | Signs access tokens and purpose tokens; use a long random value |
| `CLIENT_URL` | yes (production) | Comma-separated allowed web origins (CORS); the API refuses to start in production without it |
| `PORT` | no (5000) | Listen port |
| `NODE_ENV` | no | `production` enables HSTS, generic 5xx bodies and Secure cookies |
| `REDIS_URL` (or `REDIS_HOST`/`REDIS_PORT`) | for workers | BullMQ backend |
| `ACCESS_TOKEN_TTL_SECONDS` / `REFRESH_TOKEN_TTL_DAYS` | no (900 / 60) | Session lifetimes |
| `ADMIN_EMAILS` | no | Existing accounts promoted at boot |
| `RL_LOGIN_MAX`, `RL_ADMIN_LOGIN_MAX`, `RL_REGISTER_MAX`, `RL_FORGOT_MAX`, `RL_RESET_MAX`, `RL_REFRESH_MAX`, `RL_DELETE_MAX` | no | Rate-limit budgets |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | for Gmail | Gmail integration; disabled when blank |
| `SERVER_URL`, `EXTENSION_ID` | for extension Gmail flow | OAuth relay page and extension id fallback |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | for reset emails | Password-reset email; logged instead of sent when blank |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, … | optional | Resume-tailoring LLM, server-side only — see [docs/09](09_Gmail_Integration_and_Resume_Tailoring.md) |
| `EXPO_ACCESS_TOKEN` | optional | Expo push authentication |
| `REMINDERS_ENABLED`, `REMINDER_INTERVAL_MINUTES`, `CRON_SECRET` | optional | In-process reminder scheduler, or external cron trigger |
| `APP_LINK_BASE_URL`, `ANDROID_PACKAGE_NAME`, `ANDROID_SHA256_CERT_FINGERPRINTS`, `IOS_BUNDLE_ID`, `APPLE_TEAM_ID` | optional | Verified app links for mobile |
| `PLAYWRIGHT_PROFILE_DIR`, `PLAYWRIGHT_HEADLESS` | optional | Browser session settings for the worker |
| `SCRAPE_DETAIL_LIMIT` | optional (15) | Detail pages visited per discovery run |

Never commit `.env`; `server/.env.example` documents every key. Secrets (JWT, Google, LLM, Resend, Expo) belong only on the server; nothing in `client/`, `mobile/` or the extension may contain them.

## 5. Running the tests

| Package | Command | Notes |
|---|---|---|
| Server | `cd server && npm test` | 311 tests. Add `TEST_DATABASE_URL=postgres://user:pass@host:5432/postgres` to run the 7 real-PostgreSQL tests (migration chain, account migration/cascade, ownership trigger and scoped ingest); the tests create and drop their own scratch databases. Without it they are skipped, not failed. If `prisma generate` has not been run, a stand-in client is used so the data-layer-stubbed tests still run. |
| Web | `cd client && npm test && npm run lint && npm run build` | 54 tests (Vitest, jsdom) |
| Mobile | `cd mobile && npm run typecheck && npm run lint && npm test` | 75 tests |
| Extension | `cd browser-extension && npm test` | 92 tests |

The web, mobile and extension suites import some server modules; run `npm ci` in `server/` first.

## 6. Verifying a fresh setup

```bash
curl -s http://localhost:5000/api/auth/me          # → 401 {"code":"no_token"}
curl -s -X POST localhost:5000/api/auth/register -H 'content-type: application/json' \
  -d '{"name":"Test","email":"test@example.com","password":"secret12"}'        # → 201
```

Then sign in on the web app, add a job, and (with the worker running and an admin account) start a discovery run.

## 7. Contributing

- Branch from `main`; keep changes focused. CI (`.github/workflows/ci.yml`) must pass: lint, typecheck, build, and all four suites (the server job runs against a PostgreSQL service).
- Schema changes: edit `schema.prisma`, add a migration directory under `server/prisma/migrations/` that is **additive and idempotent**, and extend `tests/accounts/migrationChain.test.js` expectations if delete rules or constraints change.
- Anything that reads or writes a shared table must go through `services/visibility.js`; anything per-user must filter on `req.user.id`. New routes need isolation tests (see `tests/isolation/routes.test.js`).
- Never weaken a test to make it pass; fix the code or explain the change.
- Do not log request bodies, tokens or error messages that can echo user data; log error classes/codes.
