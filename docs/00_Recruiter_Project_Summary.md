# TrackTrail — Recruiter-Facing Project Summary

*A two-minute read. Every claim below is backed by code or tests in this repository; where something is a limitation, it says so.*

**TrackTrail** is a multi-user job-application tracking platform: a Node.js/PostgreSQL backend with a web app, a native mobile app, a Chrome extension and an admin console, all on one REST API.

| | |
|---|---|
| **Role** | Individual project: backend, database, web, mobile, extension, tests and documentation by one developer (Amiya Krishna Chaurasiya, B.Tech CSE). AI coding assistants were used during development; the author owns the design decisions and the verification. |
| **Stack** | Node.js 22, Express 5, PostgreSQL + Prisma 5, Redis + BullMQ, Playwright · React 19 + Vite + Tailwind · Expo 57 / React Native 0.86 + TypeScript · Chrome Manifest V3 |
| **Size** | Four codebases, roughly 50k lines of JS/TS including tests; 22 database models; 9 SQL migrations |
| **Tests** | **532 automated tests**: server 311, web 54, extension 92, mobile 75 (server count includes tests that run against a real PostgreSQL) |

## 1. The real-world problem

Job searching produces a stream of noisy, duplicated, scattered information: the same role is cross-posted across LinkedIn, Indeed, Naukri and others; application status lives in spreadsheets and email; and nothing ranks listings against your actual resume. TrackTrail turns that into a pipeline: **capture → de-duplicate → score → track → follow up**, with the user in control of every outbound action.

## 2. What the product does

- **Capture from anywhere**: manual entry, a Chrome extension that saves postings from six job sites, and a read-only Gmail scan that proposes jobs found in the inbox.
- **Track and analyse**: statuses, interview dates, notes, per-user analytics (conversion by current status), and push/in-app reminders on mobile.
- **Discover and match** (admin-operated): background discovery from seven sources into a *shared* catalog; every job is de-duplicated and scored against each user's profile with an explainable score.
- **Truthful resume tailoring**: reorders and rewords only what is already on the resume; an evidence validator rejects invented skills, numbers or employers, and the user approves each change. An LLM is optional and server-side only.
- **Account management**: self-service account deletion (password-confirmed), admin block/unblock/delete, with immediate session revocation.

## 3. Architecture in one picture

```
 Web (React)   Mobile (Expo)   Chrome extension   Admin console (inside the web app)
        \            |               |                    /
         ------------+---- one REST API (Express 5) -----+
                       auth · RBAC · rate limits · validation
                                  |
              +-------------------+--------------------+
              |                                        |
        PostgreSQL (Prisma, SQL migrations,       Redis + BullMQ workers
        triggers, partial unique indexes)         ingest · match · scrape · apply · analytics
```

The API stays thin: it authenticates, validates and enqueues. Slow or failure-prone work (scraping, scoring, browser automation) runs in a separate worker process, so API latency does not depend on it and a crashed browser cannot take the API down.

## 4. Backend and API design

- ~80 REST endpoints across 15 route modules, versioned by path prefix, consistent `{ message, code }` error bodies, rate limiting on auth, deletion and expensive endpoints.
- **Authorization is server-side and re-checked on every request**: the account row (status, role, token version) is read from the database each time, never trusted from a token, so a block, deletion or demotion takes effect on the next call from any client.
- Idempotent writes (unique keys, `ON CONFLICT` company upserts, deterministic queue job ids) for the places where concurrency is real: parallel ingests of the same posting, repeated "apply" clicks, refresh-token races.

## 5. Database modelling

- Normalised schema with explicit ownership: **global catalog** tables (jobs, companies, sources) and **private** per-user tables (tracked jobs, profiles, resumes, notifications, sessions).
- Integrity is enforced *in the database*, not just in code: a trigger guarantees "private source ⇔ owner set", partial unique indexes give separate de-duplication keys for global and per-owner rows, a `CHECK` constrains account status, and every user-owned foreign key is `ON DELETE CASCADE` while the shared catalog is `NO ACTION`.
- The migration chain builds an empty database that matches `schema.prisma` exactly, and a test proves it on real PostgreSQL (tables, columns, types, nullability, indexes, delete rules), including running the chain twice.

## 6. Authentication and authorization

- bcrypt password hashing; short-lived (15 min) access tokens; opaque 256-bit refresh tokens stored only as SHA-256 hashes, **rotated on every use** with reuse detection that revokes the whole token family.
- Web keeps the refresh token in an HttpOnly cookie and the access token only in memory; mobile uses the OS keystore (Keychain/Keystore); the extension uses its own client contract.
- Purpose-scoped tokens (password reset, OAuth state) can never be used as session tokens. Reset links are single-use (bound to the password hash) and a reset invalidates all earlier tokens.
- Roles `user` / `admin`; admin APIs are mounted behind two middlewares and re-verify the role in the database.

## 7. Global vs private data isolation

| | Global | Private |
|---|---|---|
| Created by | Admin discovery runs (LinkedIn, Naukri, Remotive, Unstop, Indeed, Wellfound, Internshala) | The user: manual, Gmail import, browser extension |
| `jobs.owner_user_id` | `NULL` | the owner's id |
| Visible to | everyone | the owner only (admins included are *not* exceptions) |

Every query over the shared `jobs` table goes through one helper (`visibleJobsWhere`) or its raw-SQL twin. Foreign ids return `404`, indistinguishable from a missing row. The client can never create a global job: a `source` sent by a client is re-classified server-side. Sources, Companies and Notifications follow the same rules, and tests drive them over HTTP against a stateful in-memory database and against real PostgreSQL.

## 8. Multi-source job ingestion

One ingestion function (`ingestJob`) is the only way a job enters the system, whether it comes from an admin discovery run, the extension, Gmail or the manual-tracker bridge: normalise → resolve company atomically → content hash → exact-duplicate check → bounded fuzzy check (same company, ±14 days) → insert with a canonical id → enqueue scoring. Seven source adapters share one factory and report honest `ok / error / blocked / unavailable` status instead of silently returning zero results. The system does not attempt to bypass CAPTCHAs or login walls.

## 9. Account security (the latest hardening pass)

- **Self-delete**: requires the current password; deletes all private data in one transaction (tracked jobs, private jobs, profile and match scores, resumes and tailoring data, sessions, push devices, notifications) and revokes the Gmail grant (best effort). Global jobs, companies and sources are preserved.
- **Admin block / unblock / delete**: admins cannot act on themselves or on other admins; the last active administrator can never be deleted. Blocking bumps a token version and revokes all sessions in one transaction, so earlier tokens stay dead even after unblocking. Blocked users cannot log in, refresh, use the Gmail callback or receive push reminders.
- This pass found and fixed: a privilege-escalation path in the `ADMIN_EMAILS` bootstrap (case-variant email registration), legacy tokens surviving a password reset, internal error text echoed on auth 500s, and a missing baseline migration.

## 10. Engineering challenges and decisions

| Decision | Why |
|---|---|
| Deduplicate synchronously at ingest, not in a queue stage | The candidate set is bounded, and it closes a race where two near-simultaneous ingests both pass an async check. |
| TF-IDF + curated skills instead of embeddings | Every score must be *explainable*. Scoring is deterministic, not a trained model; an embedding scorer is a defined upgrade path. |
| Gmail is a signal, not a write authority | Subject-line heuristics are noisy; a wrong auto-written outcome would also skew the learning loop. |
| Apply engine stops before submit | Automation prepares; a human submits. |
| Resume tailoring has no "add" operation | The no-fabrication rule holds by construction, not by trusting a model. |
| Access-token revocation via a DB-checked version | Stateless JWTs alone cannot be revoked; one indexed lookup per request buys immediate blocks. |

## 11. Testing and reliability

- 532 tests; the account/isolation suites drive the real routes and middleware over HTTP against a strict in-memory database that models cascades, foreign-key violations and transaction rollback, plus tests against a real PostgreSQL 16.
- CI runs lint, typecheck, build and all suites on every change, with a PostgreSQL service so the database tests are not skipped.
- Reliability features: queue retries with backoff, exactly-once reminders (unique dedupe key), crash-safe discovery-run status handling, and non-cacheable polling endpoints.

## 12. Scalability and production considerations (honest version)

- **Designed for**: stateless API instances, workers scaled per queue, database indexes on every ownership and ordering path, bounded fuzzy matching.
- **Not yet true**: rate limiting is per-process memory (needs a Redis store for multi-instance); analytics are computed live per user (fine at this scale, would need caching or rollups at 10×); no load testing has been performed, so no throughput numbers are claimed.
- **Known limits**: discovery from job boards depends on Playwright and can be blocked by the sites; analytics measure *current* status, not stage history; the Prisma client could not be generated in the verification sandbox (see [docs/10](10_QA_Security_and_Verification_Report.md)).

## Where to look first (5 minutes)

1. `server/middleware/authMiddleware.js` and `server/lib/sessions.js` — authentication and session design.
2. `server/services/accountDeletion.js` and `server/routes/adminRoutes.js` — account management.
3. `server/services/visibility.js` and `server/prisma/migrations/20261004000000_*` — data isolation, enforced in code and in the database.
4. `server/tests/accounts/` and `server/tests/isolation/` — how it is verified.
5. [docs/10](10_QA_Security_and_Verification_Report.md) — what was tested, how, and what is *not* verified.
