# TrackTrail — Automated Job Application Tracking System

A multi-user job-application platform with email ingestion, multi-source job discovery, explainable job matching and truthful resume tailoring. One Node.js/PostgreSQL backend serves a **web app**, a native **mobile app**, a **Chrome extension** and an **admin console**.

> **Hiring manager or recruiter?** Start with the two-minute [Recruiter Project Summary](docs/00_Recruiter_Project_Summary.md). The engineering evidence (tests, security checks, limitations) is in the [QA, Security & Verification Report](docs/10_QA_Security_and_Verification_Report.md).

## What it demonstrates

| Area | Evidence in this repository |
|---|---|
| Backend and API design | Express 5 REST API, ~80 endpoints, thin handlers, background workers (BullMQ), consistent error contract — [API reference](docs/04_API_Reference.md) |
| Database modelling | 22 Prisma models, 9 SQL migrations, triggers, partial unique indexes, cascade rules; the chain builds an empty DB identical to the schema (tested on PostgreSQL) — [architecture](docs/01_Project_Structure_and_Architecture.md) |
| Authentication | bcrypt, 15-minute access tokens, rotating hashed refresh tokens with reuse detection, per-request account check |
| Authorization and isolation | Server-enforced roles; global vs private data separated in code *and* in the database — [roles & account management](docs/11_Roles_Permissions_Platforms_and_Release_Notes.md) |
| Account security | Password-confirmed self-delete, admin block/unblock/delete, last-admin and self protection, immediate token/session revocation |
| Multi-source ingestion | Seven discovery adapters, extension capture, Gmail scan, one ingestion path with exact + fuzzy de-duplication — [engine design](docs/02_Job_Application_Engine_Design.md) |
| Testing | **532 automated tests** (server 311, web 54, extension 92, mobile 75), CI on every change |

## Product capabilities

- **Tracker**: applications with status, interview dates, notes and source; Applied Jobs, Matched Jobs, Companies, Sources, Analytics.
- **Capture**: manual entry, Chrome extension (LinkedIn, Indeed, Naukri, Internshala, Wellfound, Unstop), read-only Gmail scan.
- **Discovery** (admin only): Remotive, LinkedIn, Indeed, Naukri, Internshala, Wellfound, Unstop feed a shared catalog through background workers.
- **Matching**: deterministic TF-IDF + weighted skill overlap, with an explanation stored for every score; a feedback loop adjusts skill weights from recorded outcomes.
- **Resume tailoring**: reorders and rewords only existing resume content; every change is validated against the resume and approved by the user. LLM provider optional, server-side only — [details](docs/09_Gmail_Integration_and_Resume_Tailoring.md).
- **Mobile**: push and in-app reminders (interviews, follow-ups, high-match jobs), secure session storage, deep links.
- **Account management**: self-service deletion; admin block, unblock and delete.

## Architecture

```
 Web (React 19)   Mobile (Expo 57)   Chrome extension (MV3)   Admin console (in the web app)
        \               |                   |                        /
         +--------------+---- REST API (Express 5) ----------------+
                         auth · RBAC · rate limits · validation
                                      |
                   +------------------+-------------------+
                   |                                      |
             PostgreSQL (Prisma)                   Redis + BullMQ
             SQL migrations, triggers,             worker process: ingest, match,
             partial unique indexes                scrape, apply, analytics
```

The API authenticates, validates and enqueues; workers do the slow, failure-prone work (scraping, scoring, Playwright). The two processes deploy and fail independently.

## Data isolation in one table

| | Global data | Private data |
|---|---|---|
| Jobs | `owner_user_id IS NULL`, from admin discovery | `owner_user_id = user`, from manual / Gmail / extension |
| Visible to | every user | the owner only (admins get no exception) |
| Enforced by | `visibleJobsWhere()` on every query, a `enforce_job_scope` trigger, partial unique indexes | the same, plus `404` for foreign ids |

## Repository layout

| Path | Contents |
|---|---|
| `server/` | API, workers, Prisma schema and migrations, 311 tests — see [server/README.md](server/README.md) |
| `client/` | React web app and admin console — [client/README.md](client/README.md) |
| `mobile/` | Expo / React Native app — [mobile/README.md](mobile/README.md) |
| `browser-extension/` | Chrome extension — [browser-extension/README.md](browser-extension/README.md) |
| `docs/` | Architecture, API reference, setup, deployment, QA and security report |
| `.github/workflows/` | CI (lint, typecheck, build, tests with PostgreSQL), mobile release, reminder cron |

## Quick start

Requires Node.js 22+, PostgreSQL (verified on 16) and, for workers, Redis. Full guide: [docs/03](docs/03_Setup_Installation_and_Contributing.md).

```bash
# API
cd server && npm ci
cp .env.example .env              # set DATABASE_URL, JWT_SECRET, CLIENT_URL
npx prisma generate
npx prisma migrate deploy         # builds the full schema from an empty database
npm start

# Workers (discovery, matching, apply, analytics) — separate process
npm run worker

# Web app
cd ../client && npm ci && npm run dev

# Mobile app / extension: see their READMEs
```

## Running the tests

```bash
cd server            && npm test                 # add TEST_DATABASE_URL=postgres://... to include the real-PostgreSQL tests
cd client            && npm test && npm run lint && npm run build
cd mobile            && npm run typecheck && npm run lint && npm test
cd browser-extension && npm test
```

## Honest limitations

- Job-board discovery uses Playwright and can be blocked or broken by the sites; blocks are reported per source, never bypassed.
- Analytics reflect each application's *current* status, not its stage history; average response time is not computed.
- Rate limiting is in-process (per instance); scaling the API horizontally needs a shared store.
- No load or performance testing has been done; no throughput figures are claimed.
- Fuzzy-duplicate threshold (0.85) is hand-tuned, not trained on labelled data.
- Email addresses are not verified at sign-up; use `npm run make-admin` for the first administrator rather than relying on `ADMIN_EMAILS` alone.

More in [docs/10](docs/10_QA_Security_and_Verification_Report.md).

## Documentation index

| Doc | Topic |
|---|---|
| [00](docs/00_Recruiter_Project_Summary.md) | Recruiter-facing project summary |
| [01](docs/01_Project_Structure_and_Architecture.md) | Architecture, data model, security design |
| [02](docs/02_Job_Application_Engine_Design.md) | Ingestion, discovery, matching, apply engine |
| [03](docs/03_Setup_Installation_and_Contributing.md) | Setup, environment, contributing |
| [04](docs/04_API_Reference.md) | API reference |
| [05](docs/05_Deployment_and_Operations.md) | Deployment and operations |
| [06](docs/06_Web_Client_Production_and_Responsiveness.md) · [07](docs/07_Mobile_App_Implementation_and_Release.md) · [08](docs/08_Browser_Extension_Status_and_Hardening.md) | Web, mobile, extension |
| [09](docs/09_Gmail_Integration_and_Resume_Tailoring.md) | Gmail and AI resume tailoring |
| [10](docs/10_QA_Security_and_Verification_Report.md) | QA, security and verification report |
| [11](docs/11_Roles_Permissions_Platforms_and_Release_Notes.md) | Roles, permissions, account management, release notes |
