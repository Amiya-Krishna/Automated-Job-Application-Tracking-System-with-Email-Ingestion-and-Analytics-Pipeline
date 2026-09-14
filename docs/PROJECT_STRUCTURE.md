# Project Structure & Architecture

Comprehensive guide to TrackTrail's structure and architecture.

---

## Directory Structure

```
TrackTrail/
│
├── 📄 README.md                          # Project overview, architecture, and quick start
│
├── 📁 server/                            # Backend - Node.js/Express/Prisma
│   ├── 📄 server.js                      # Express server entry point
│   ├── 📄 package.json                   # Backend dependencies
│   ├── 📄 worker.js                      # Boots the BullMQ background workers
│   ├── 📄 .env.example                   # Template for server/.env (not committed)
│   │
│   ├── 📁 prisma/                        # Prisma ORM — schema + migrations
│   │   ├── schema.prisma                 # Full schema (tracker + engine tables) — the single source of truth for the DB shape
│   │   └── migrations/                   # Committed, timestamped SQL migrations, applied via `npx prisma migrate deploy`
│   │
│   ├── 📁 lib/
│   │   └── prisma.js                     # Shared PrismaClient instance + a `query()` helper for raw SQL (used for aggregate queries Prisma's query builder doesn't express well)
│   │
│   ├── 📁 config/
│   │   └── google.js                     # Gmail OAuth client setup
│   │
│   ├── 📁 routes/                        # API route definitions (logic lives directly in routes — no separate controllers/ layer)
│   │   ├── authRoutes.js                 # /api/auth — register, login, forgot/reset password
│   │   ├── jobRoutes.js                  # /api/jobs — manual tracker CRUD (tracked_jobs)
│   │   ├── gmailRoutes.js                # /api/gmail — OAuth connect + inbox scan
│   │   ├── ingestRoutes.js               # /api/ingest — engine: shared job ingestion entrypoint
│   │   ├── scrapeRoutes.js               # /api/scrape — Job Discovery: trigger/poll/delete async discovery runs
│   │   ├── engineJobsRoutes.js           # /api/engine/jobs — engine: browse discovered/matched jobs
│   │   ├── applyRoutes.js                # /api/applications — engine: apply + outcome tracking
│   │   ├── analyticsRoutes.js            # /api/analytics — engine: live per-user summary + funnel
│   │   ├── profileRoutes.js              # /api/profile — engine: per-user resume/skills profile
│   │   ├── companiesRoutes.js            # /api/companies — engine: browse the companies table
│   │   └── sourcesRoutes.js              # /api/sources — engine: browse the job_sources table
│   │
│   ├── 📁 middleware/
│   │   └── authMiddleware.js             # JWT verification (reads the `token` header)
│   │
│   ├── 📁 services/                      # Intelligent Job Application Engine logic
│   │   ├── ingestionService.js           # normalize → dedup → insert → enqueue match
│   │   ├── jobDiscovery/index.js         # orchestrates a discovery run across the registered adapters, ingests results
│   │   ├── dedupService.js               # exact hash + fuzzy duplicate detection
│   │   ├── matchingService.js            # TF-IDF cosine similarity + curated skill-vocabulary overlap
│   │   ├── learningService.js            # adjusts skill weights from recorded outcomes
│   │   ├── applyEngine.js                # Playwright-driven, human-in-the-loop apply flow
│   │   ├── analyticsService.js           # live, per-user analytics SQL (what /api/analytics actually queries)
│   │   ├── appliedJobsService.js         # merges tracked_jobs + bridged engine data into one Applied Jobs view
│   │   ├── engineBridge.js               # bridges a manually-added TrackedJob into the engine pipeline for matching
│   │   ├── rateLimiter.js                # Redis token bucket for discovery/apply rate limits
│   │   ├── seedSources.js                # idempotently seeds the job_sources table on server startup
│   │   ├── emailService.js               # Resend-backed forgot-password emails
│   │   ├── skills.js                     # skill keyword extraction
│   │   ├── textUtils.js                  # text normalization, hashing, HTML stripping
│   │   └── scraper.js                    # STANDALONE, NOT wired into any worker/route — see "Known limitations" in the README
│   │
│   ├── 📁 adapters/                      # Two unrelated kinds of adapter live in this one folder:
│   │   ├── remotiveJobsAdapter.js        #   Job Discovery: Remotive's public API (real, working)
│   │   ├── linkedinJobsAdapter.js        #   Job Discovery: reports "unavailable" — no official API integration
│   │   ├── indeedJobsAdapter.js          #   Job Discovery: reports "unavailable" — no official API integration
│   │   ├── greenhouseAdapter.js          #   Apply engine: per-ATS field-mapping for Greenhouse
│   │   ├── genericAdapter.js             #   Apply engine: fallback field-mapping for unrecognized ATS platforms
│   │   └── index.js                      #   Apply engine: selects an adapter for a given application URL
│   │
│   ├── 📁 workers/                       # BullMQ worker processes (run together via `npm run worker`)
│   │   ├── ingestWorker.js               # consumes the ingest queue
│   │   ├── matchWorker.js                # consumes the match queue
│   │   ├── applyWorker.js                # consumes the apply queue
│   │   ├── analyticsWorker.js            # consumes the analytics queue (populates the legacy analytics_daily rollup — not what the live dashboard reads)
│   │   └── scrapeWorker.js               # consumes the scrape queue — runs Job Discovery adapters, ingests results
│   │
│   ├── 📁 queue/
│   │   └── index.js                      # BullMQ queue definitions (ingest, dedup, match, apply, analytics, scrape)
│   │
│   ├── 📁 scripts/
│   │   └── clearApplyQueue.js            # one-off maintenance script (`npm run clear-apply-queue`)
│   │
│   └── 📁 playwright-profile/            # Persistent browser profile for the apply engine (gitignored in practice)
│
├── 📁 client/                            # Frontend - React/Vite
│   ├── 📄 index.html                     # HTML entry point
│   ├── 📄 package.json                   # Frontend dependencies
│   ├── 📄 vite.config.js                 # Vite configuration
│   │
│   ├── 📁 src/
│   │   ├── 📄 main.jsx                   # React entry point
│   │   ├── 📄 App.jsx                    # Route definitions
│   │   ├── 📄 api.js                     # Axios instance (base URL + token header + 401 handling)
│   │   ├── 📄 index.css                  # Global styles (Tailwind)
│   │   │
│   │   ├── 📁 components/
│   │   │   ├── Navbar.jsx
│   │   │   ├── AuthShell.jsx             # Shared layout for login/register/forgot-password
│   │   │   ├── DashboardCards.jsx        # Summary stat cards
│   │   │   ├── StateViews.jsx            # Shared loading/empty/error state components
│   │   │   ├── ThemeToggle.jsx           # Light/dark mode toggle
│   │   │   └── ProtectedRoute.jsx        # Redirects to /login if not authenticated
│   │   │
│   │   ├── 📁 pages/
│   │   │   ├── Landing.jsx               # `/` — public marketing/landing page
│   │   │   ├── Login.jsx                 # `/login`
│   │   │   ├── Register.jsx              # `/register`
│   │   │   ├── ForgotPassword.jsx        # `/forgot-password`
│   │   │   ├── ResetPassword.jsx         # `/reset-password`
│   │   │   ├── Dashboard.jsx             # `/dashboard`
│   │   │   ├── AddJob.jsx                # Add-job entry point
│   │   │   ├── JobForm.jsx               # `/add-job`, `/edit-job/:id`
│   │   │   ├── JobDiscovery.jsx          # `/job-discovery` — trigger/poll/remove Remotive discovery runs
│   │   │   ├── AppliedJobs.jsx           # `/applied-jobs` — the unified tracked_jobs view (manual + engine-applied)
│   │   │   ├── Integrations.jsx          # `/integrations` — Gmail connect/scan
│   │   │   ├── Profile.jsx               # `/profile` — user_profile table (per-user)
│   │   │   ├── Analytics.jsx             # `/analytics` — live per-user conversion/funnel dashboard
│   │   │   ├── MatchedJobs.jsx           # `/matched-jobs` — jobs + match_scores tables
│   │   │   ├── EngineApplications.jsx    # `/engine-applications` — the automated apply engine's own applications table
│   │   │   ├── Companies.jsx             # `/companies` — companies table
│   │   │   ├── Sources.jsx               # `/sources` — job_sources table
│   │   │   └── NotFound.jsx              # `*`
│   │   │
│   │   └── 📁 utils/
│   │       ├── auth.js                   # Token storage helpers
│   │       └── emailParser.js            # Parses pasted/Gmail email text into job fields
│   │
│   └── 📁 public/                        # Static assets (favicon, icons.svg)
│
├── 📁 browser-extension/                 # Chrome extension (Manifest V3) — manual capture + full engine dashboard
│   ├── manifest.json
│   ├── content.js / content.css          # Injects a "Save to TrackTrail" button on LinkedIn/Indeed job postings
│   ├── background.js
│   ├── popup.html / popup.js / popup.css # Toolbar popup — login, tracked_jobs list, add job
│   ├── dashboard.html / dashboard.js / dashboard.css
│   │                                      # Full-page dashboard (chrome-extension://<id>/dashboard.html):
│   │                                      #   Matched Jobs, Applications, Analytics, Companies, Sources,
│   │                                      #   Profile, Email — all authenticated, mirroring the web client
│   └── config.js                         # DEFAULT_API_BASE_URL
│
├── 📁 mobile/                             # Native Expo/React Native app — same backend, no duplicated logic
│   ├── 📄 README.md                      # Full architecture, setup, env vars, and known limitations
│   ├── 📄 app.json                       # Expo config — scheme: "mobile" (used by Gmail OAuth + password-reset deep links)
│   ├── 📁 app/                           # Expo Router file-based routes ((tabs)/, (auth)/, application/, job/, account/, companies/, sources/)
│   ├── 📁 services/                      # One file per API area, wrapping the shared Axios client — the only layer that knows endpoint paths
│   ├── 📁 hooks/                         # TanStack Query hooks built on services/
│   ├── 📁 types/                         # One file per API area, documenting the exact backend contract each type matches
│   └── 📁 components/                    # Shared UI (cards, badges, empty/loading/error states, form fields)
│
└── 📁 docs/                              # Documentation (this folder)
    ├── GETTING_STARTED.md
    ├── INSTALLATION.md
    ├── API_ENDPOINTS.md
    ├── PROJECT_STRUCTURE.md              # This file
    ├── DEPLOYMENT.md
    ├── GMAIL_INTEGRATION.md
    ├── CONTRIBUTING.md
    └── intelligent-job-application-engine-design.md
```

---

## Backend Architecture

### File: `server/server.js`

**Purpose**: Express server entry point

```javascript
// Key responsibilities:
- Initialize Express app
- Connect to Postgres via Prisma ($connect()) and fail fast if it's unreachable
- Seed job_sources on startup (manual/linkedin/indeed/remotive/gmail/extension)
- Setup CORS (allowlist from CLIENT_URL, plus chrome-extension:// origins)
- Mount all route modules (auth, jobs, gmail, and the engine routes)
- Add BigInt.prototype.toJSON so res.json() can serialize BigInt id columns
- Centralized JSON error handler
- Start server on the configured PORT
```

### Directory: `server/prisma/`

**Database schema and migrations** — this project uses Prisma, not a raw `pg`
pool with hand-written model files.

```
schema.prisma
- users, tracked_jobs (auth/manual tracker — per-user)
- jobs, companies, job_sources, applications, match_scores,
  user_profile, scrape_runs, analytics_daily (engine)
- user_profile and match_scores are scoped per user (user_id / profile_id);
  jobs/companies/job_sources are shared/global catalog data; applications
  stays global/job-keyed by design (see the README's Database Design and
  Trade-offs sections for the reasoning)

migrations/
- Timestamped, committed SQL migrations
- Applied via `npx prisma migrate deploy` (production) or
  `npx prisma migrate dev` (local development)
```

There is no `server/db/` or `server/models/` directory, and no hand-written
`schema.sql` — that was an earlier, pre-Prisma version of this project. The
one remaining reference to that era, `server/migrate.js`
(`npm run db:migrate`), is dead code: it reads a `db/schema.sql` file that no
longer exists and will fail if run. Use the Prisma commands above instead —
see [GETTING_STARTED.md](GETTING_STARTED.md).

### Directory: `server/lib/`

`prisma.js` exports a single shared `PrismaClient` instance plus a `query()`
helper that wraps `$queryRawUnsafe` for the aggregate/analytics SQL that's
more natural to write as raw SQL than through Prisma's query builder (see
`services/analyticsService.js`, `services/dedupService.js`).

### Directory: `server/routes/`

**API Route Definitions** — business logic lives directly in each route
handler (there is no separate `controllers/` layer). See
[API_ENDPOINTS.md](API_ENDPOINTS.md) for the full endpoint reference,
including the newer Job Discovery routes (`scrapeRoutes.js`) and each route's
current auth requirements.

#### `authRoutes.js` — mounted at `/api/auth`

```
POST   /api/auth/register          - Create a user
POST   /api/auth/login             - Log in, receive a JWT
```

(also has a forgot/reset-password flow — see the route file and
`services/emailService.js`)

#### `jobRoutes.js` — mounted at `/api/jobs`

```
POST   /api/jobs                   - Create a tracked job
GET    /api/jobs                   - Get all jobs for the logged-in user
PUT    /api/jobs/:id                - Update a job (ownership-checked)
DELETE /api/jobs/:id                - Delete a job (ownership-checked)
```

#### `gmailRoutes.js` — mounted at `/api/gmail`

```
GET    /api/gmail/auth-url         - Get the Google consent URL
GET    /api/gmail/callback         - OAuth redirect target
GET    /api/gmail/status           - Is Gmail connected?
POST   /api/gmail/disconnect       - Remove the stored refresh token
GET    /api/gmail/scan             - Scan inbox for interview/offer/rejection emails
```

#### `scrapeRoutes.js` — mounted at `/api/scrape`

```
POST   /api/scrape/run             - Start an async discovery run (Remotive; LinkedIn/Indeed report "unavailable")
GET    /api/scrape/runs            - List the caller's recent runs
GET    /api/scrape/runs/:id        - Poll a run's status (Cache-Control: no-store — see README)
DELETE /api/scrape/runs/:id        - Remove one of the caller's own run-history rows
```

#### Engine routes — `ingestRoutes.js`, `engineJobsRoutes.js`, `applyRoutes.js`, `analyticsRoutes.js`, `profileRoutes.js`, `companiesRoutes.js`, `sourcesRoutes.js`

See [API_ENDPOINTS.md](API_ENDPOINTS.md) for the full list — these back the
Intelligent Job Application Engine described in
[intelligent-job-application-engine-design.md](intelligent-job-application-engine-design.md).
All of them require the `token` header.

### Directory: `server/middleware/`

#### `authMiddleware.js`

- Reads the JWT from the `token` request header (not `Authorization: Bearer`)
- Verifies it and attaches the decoded payload to `req.user`
- Returns 401/400 on missing or invalid tokens

### Directories: `server/services/`, `adapters/`, `workers/`, `queue/`

These power the **Intelligent Job Application Engine** — Job Discovery
(Remotive), deduplication, TF-IDF matching, a human-in-the-loop Playwright
apply flow, and live per-user analytics, all running as BullMQ workers
(`npm run worker`) separate from the API process. See
[intelligent-job-application-engine-design.md](intelligent-job-application-engine-design.md)
for the full design, and the README's Architecture section for the current
module map.

---

## Frontend Architecture

### File: `client/src/main.jsx`

**Purpose**: React application entry point — mounts `<App />` to the DOM.

### File: `client/src/App.jsx`

**Purpose**: Route definitions

```javascript
/                    → Landing
/login               → Login
/register            → Register
/forgot-password     → ForgotPassword
/reset-password      → ResetPassword
/dashboard           → Dashboard         (protected)
/add-job             → JobForm           (protected)
/edit-job/:id        → JobForm           (protected)
/job-discovery       → JobDiscovery      (protected)
/applied-jobs        → AppliedJobs       (protected)
/integrations        → Integrations      (protected)
/profile             → Profile           (protected)
/analytics           → Analytics         (protected)
/matched-jobs        → MatchedJobs       (protected)
/engine-applications → EngineApplications (protected)
/companies           → Companies         (protected)
/sources             → Sources           (protected)
/jobs                → redirects to /applied-jobs
*                    → NotFound
```

### Directory: `client/src/components/`

**Reusable UI Components**

| Component            | Purpose                                     |
| --------------------- | -------------------------------------------- |
| `Navbar.jsx`          | Top navigation bar                          |
| `AuthShell.jsx`       | Shared layout wrapper for Login/Register/ForgotPassword |
| `DashboardCards.jsx`  | Summary stat cards                          |
| `StateViews.jsx`      | Shared loading/empty/error state components |
| `ThemeToggle.jsx`     | Light/dark mode toggle                      |
| `ProtectedRoute.jsx`  | Redirects unauthenticated users to `/login` |

### Directory: `client/src/pages/`

**Full-Page Components** — see the route table above for the path each one
is mounted at.

### File: `client/src/api.js`

**API Communication Layer**

```javascript
// Responsibilities:
- Single Axios instance, baseURL = `${VITE_API_BASE_URL}/api`
- Request interceptor: attaches the stored JWT as the `token` header
- Response interceptor: on 401, clears the token and redirects to /login
```

There is no separate `services/` layer — pages call `api.js` directly.

### File: `client/src/utils/`

- `auth.js` — reads/writes the JWT in local/session storage
- `emailParser.js` — parses pasted or Gmail-scanned email text into
  company/role/status fields for the "paste an email" quick-add flow

### File: `client/src/index.css`

Tailwind CSS entry point (base styles + utility imports).

---

## Data Flow

### Authentication Flow

```
User Input
    ↓
Login/Register page component
    ↓
api.js → POST /api/auth/login (or /register)
    ↓
authRoutes.js → prisma.user.findUnique / prisma.user.create
    ↓
bcrypt compare/hash + jwt.sign()
    ↓
Token + user returned to client
    ↓
Stored in localStorage/sessionStorage
    ↓
Redirect to Dashboard
```

### Job Discovery Flow

```
User submits a search on /job-discovery
    ↓
api.js → POST /api/scrape/run   (token header attached automatically)
    ↓
scrapeRoutes.js creates a ScrapeRun row (status: queued), enqueues on BullMQ
    ↓
scrapeWorker.js picks it up → calls the Remotive adapter (or reports
    LinkedIn/Indeed as "unavailable")
    ↓
Results go through ingestJob() → normalize → dedup → insert → enqueue match
    ↓
ScrapeRun.status moves queued → running → succeeded/failed/blocked
    ↓
Client polls GET /api/scrape/runs/:id (Cache-Control: no-store) until done
    ↓
Update UI
```

### Job Creation Flow (manual tracker)

```
User Fills Form
    ↓
JobForm component
    ↓
api.js → POST /api/jobs   (token header attached automatically)
    ↓
jobRoutes.js → prisma.trackedJob.create()
    ↓
INSERT INTO tracked_jobs ...
    ↓
If enough data is present, engineBridge.js fires the job into the
    engine ingestion pipeline in the background (for matching)
    ↓
Return created row to client
    ↓
Update UI
```

### Data Fetch Flow

```
Dashboard Mounts
    ↓
useEffect triggers
    ↓
api.js → GET /api/jobs
    ↓
jobRoutes.js → prisma.trackedJob.findMany({ where: { userId } })
    ↓
Return jobs array
    ↓
Update component state
    ↓
Render jobs
```

---

## Technology Stack Details

### Backend

- **Runtime**: Node.js
- **Framework**: Express 5
- **Database**: PostgreSQL via **Prisma** (`@prisma/client`) — no raw `pg` model layer
- **Queue**: BullMQ + Redis (discovery/matching/apply/analytics engine)
- **Automation**: Playwright (human-in-the-loop apply flow)
- **Authentication**: JWT + bcryptjs

### Frontend

- **Library**: React 19
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios
- **Routing**: React Router
- **Charts**: Recharts (Analytics page)

### Development Tools

- **Package Manager**: npm
- **Version Control**: Git
- **Environment**: Node.js development server

---

## Key Dependencies

### Backend (`server/package.json`)

```json
{
  "@prisma/client": "^5.22.0",
  "express": "^5.2.1",
  "pg": "^8.22.0",
  "bcryptjs": "^3.0.3",
  "jsonwebtoken": "^9.0.3",
  "dotenv": "^17.4.2",
  "cors": "^2.8.6",
  "bullmq": "^5.80.9",
  "ioredis": "^5.11.1",
  "playwright": "^1.49.1",
  "googleapis": "^173.0.0",
  "natural": "^8.1.1"
}
```

(`prisma` itself, the CLI, is a devDependency used for `prisma generate` /
`prisma migrate`.)

### Frontend (`client/package.json`)

```json
{
  "react": "^19.x",
  "react-router-dom": "^7.x",
  "axios": "^1.16.1",
  "vite": "^6.x",
  "tailwindcss": "^4.x",
  "recharts": "^2.x"
}
```

---

## Security Considerations

### Password Security

- Hashed with bcryptjs
- Never stored in plain text
- Validated on login

### JWT Authentication

- Token generated on login (unsigned expiry — no `expiresIn` set on the main login token)
- Sent as a plain `token` request header (not `Authorization: Bearer`)
- Verified on every protected route via `authMiddleware.js`

### Multi-User Data Isolation

Every user-owned table is scoped by the authenticated user's id, enforced at
the query level (not just hidden in the UI):

- `tracked_jobs` — the manual tracker, Applied Jobs, and everything Analytics reads from
- `user_profile` — one resume/skills profile per user (`user_profile.user_id`)
- `match_scores` — scoped per `(job_id, profile_id, method)`, so two users' scores for the same job never collide
- `scrape_runs` — Job Discovery run history, scoped per user, deletable only by its owner

`jobs`, `companies`, and `job_sources` are genuinely shared/global catalog
data by design — every user legitimately sees the same underlying listings.
`applications` (the automated apply engine's own record) stays global/job-
keyed rather than per-user; ownership for actions on it is derived through
the caller's own `tracked_jobs` row instead. See the README's Trade-offs and
Database Design sections for the full reasoning.

### CORS Protection

- Configured via `CLIENT_URL` (comma-separated allowlist)
- Also explicitly allows any `chrome-extension://` origin, for the browser extension
- Requests with no `Origin` header (curl/Postman) are allowed through

### Environment Variables

- Sensitive data in `server/.env` (`DATABASE_URL`, `JWT_SECRET`, Google OAuth secrets)
- Never committed to version control
- Loaded via `dotenv` at application start

---

## Scalability Considerations

### Current (Modular Monolith)

- One Express app serves both the manual tracker and the engine API
- Background work (discovery, matching, applying, analytics) already runs as
  **separate worker processes** (`npm run worker`) so a Playwright crash never
  takes the API down
- Good for small to medium usage

### Database Optimization

- Indexes on frequently queried columns (see `prisma/schema.prisma`)
- Connection pooling via Prisma's own pool
- Analytics are computed live per user rather than through a shared
  precomputed rollup — see the README's Analytics section for the tradeoff

### Future Directions

- Split the engine (discovery/matching/apply/analytics) into its own deployable service
- Add `pgvector` for embedding-based matching at scale (see the engine design doc)
- Add a stage-history table so Analytics can measure historical, not just current-status, conversion
- API gateway / rate limiting in front of both services

---

## Environment-Specific Configuration

### Development

- CORS allows `localhost` explicitly via `CLIENT_URL`
- Detailed error messages returned in JSON error responses

### Production

- Optimized Vite bundle (`npm run build`)
- `CLIENT_URL` restricted to the actual deployed frontend domain(s)
- `DATABASE_URL` points at a production-tier hosted Postgres instance
- Migrations applied via `npx prisma migrate deploy`, not `prisma migrate dev`

---

## File Naming Conventions

### React Components

- PascalCase: `JobDiscovery.jsx`, `AuthShell.jsx`
- One component per file
- `pages/` mirrors routes; `components/` holds shared/reusable pieces

### JavaScript Files

- camelCase: `authMiddleware.js`, `ingestionService.js`
- Functions and variables: camelCase
- Constants: UPPER_SNAKE_CASE

### CSS/Styling

- Tailwind utility classes, configured via `index.css`

---

**Last Updated**: August 25, 2026
