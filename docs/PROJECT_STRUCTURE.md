# Project Structure & Architecture

Comprehensive guide to the Job Application Tracker Portal's structure and architecture.

---

## Directory Structure

```
Job Application Tracker Portal/
│
├── 📄 README.md                          # Project overview and quick start
├── 📄 package.json                       # Root-level scripts/metadata
│
├── 📁 server/                            # Backend - Node.js/Express
│   ├── 📄 server.js                      # Express server entry point
│   ├── 📄 package.json                   # Backend dependencies
│   ├── 📄 migrate.js                     # Applies db/schema.sql (npm run db:migrate)
│   ├── 📄 worker.js                      # Boots the BullMQ background workers
│   ├── 📄 .env                           # Environment variables (not committed)
│   │
│   ├── 📁 db/                            # Postgres connection + schema
│   │   ├── pg.js                         # Shared `pg` connection pool + query() helper
│   │   └── schema.sql                    # Full Postgres schema (tracker + engine tables)
│   │
│   ├── 📁 config/
│   │   └── google.js                     # Gmail OAuth client setup
│   │
│   ├── 📁 models/                        # Postgres-backed data access (plain functions, no ORM)
│   │   ├── User.js                       # users table — findByEmail, create, setGmailRefreshToken...
│   │   └── Job.js                        # tracked_jobs table — create, findAllByUser, update, delete
│   │
│   ├── 📁 routes/                        # API route definitions (logic lives directly in routes)
│   │   ├── authRoutes.js                 # /api/auth — register, login
│   │   ├── jobRoutes.js                  # /api/jobs — manual tracker CRUD
│   │   ├── gmailRoutes.js                # /api/gmail — OAuth connect + inbox scan
│   │   ├── ingestRoutes.js               # /api/ingest — engine: job ingestion entrypoint
│   │   ├── engineJobsRoutes.js           # /api/engine/jobs — engine: browse scraped/matched jobs
│   │   ├── applyRoutes.js                # /api/applications — engine: apply + outcome tracking
│   │   ├── analyticsRoutes.js            # /api/analytics — engine: summary + funnel stats
│   │   ├── profileRoutes.js              # /api/profile — engine: resume/skills profile
│   │   ├── companiesRoutes.js            # /api/companies — engine: browse the companies table
│   │   └── sourcesRoutes.js              # /api/sources — engine: browse the job_sources table
│   │
│   ├── 📁 middleware/
│   │   └── authMiddleware.js             # JWT verification (reads the `token` header)
│   │
│   ├── 📁 services/                      # Intelligent Job Application Engine logic
│   │   ├── ingestionService.js           # normalize → dedup → insert → enqueue match
│   │   ├── dedupService.js               # exact hash + fuzzy duplicate detection
│   │   ├── matchingService.js            # TF-IDF + keyword / embedding scoring
│   │   ├── learningService.js            # adjusts skill weights from outcomes
│   │   ├── applyEngine.js                # Playwright-driven, human-in-the-loop apply flow
│   │   ├── rateLimiter.js                # Redis token bucket for scrape/apply rate limits
│   │   ├── scraper.js                    # scheduled LinkedIn/Indeed scraper
│   │   ├── skills.js                     # skill keyword extraction
│   │   └── textUtils.js                  # text normalization helpers
│   │
│   ├── 📁 adapters/                      # Per-ATS field-mapping adapters for the apply engine
│   │   ├── greenhouseAdapter.js
│   │   ├── genericAdapter.js
│   │   └── index.js
│   │
│   ├── 📁 workers/                       # BullMQ worker processes (run via `npm run worker`)
│   │   ├── matchWorker.js
│   │   ├── applyWorker.js
│   │   └── analyticsWorker.js
│   │
│   ├── 📁 queue/                         # BullMQ queue definitions
│   │   └── index.js
│   │
│   └── 📁 playwright-profile/            # Persistent browser profile for the apply engine (gitignored in practice)
│
├── 📁 client/                            # Frontend - React/Vite
│   ├── 📄 index.html                     # HTML entry point
│   ├── 📄 package.json                   # Frontend dependencies
│   ├── 📄 vite.config.js                 # Vite configuration
│   ├── 📄 vercel.json                    # SPA rewrite rule for Vercel
│   ├── 📄 .env                           # VITE_API_BASE_URL (not committed)
│   │
│   ├── 📁 src/
│   │   ├── 📄 main.jsx                   # React entry point
│   │   ├── 📄 App.jsx                    # Route definitions
│   │   ├── 📄 api.js                     # Axios instance (base URL + token header + 401 handling)
│   │   ├── 📄 index.css                  # Global styles (Tailwind)
│   │   │
│   │   ├── 📁 components/
│   │   │   ├── Navbar.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   ├── AuthShell.jsx             # Shared layout for login/register
│   │   │   ├── DashboardCards.jsx        # Summary stat cards
│   │   │   ├── JobTable.jsx              # Job list table
│   │   │   └── ProtectedRoute.jsx        # Redirects to /login if not authenticated
│   │   │
│   │   ├── 📁 pages/
│   │   │   ├── Landing.jsx               # Public marketing/landing page (`/`)
│   │   │   ├── Login.jsx                 # `/login`
│   │   │   ├── Register.jsx              # `/register`
│   │   │   ├── ForgotPassword.jsx        # `/forgot-password`
│   │   │   ├── ResetPassword.jsx         # `/reset-password`
│   │   │   ├── Dashboard.jsx             # `/dashboard` — tracked_jobs (manual tracker)
│   │   │   ├── AddJob.jsx                # Add-job entry point
│   │   │   ├── JobForm.jsx               # `/add-job`, `/edit-job/:id`
│   │   │   ├── Integrations.jsx          # `/integrations` — Gmail connect/scan
│   │   │   ├── Profile.jsx               # `/profile` — user_profile table
│   │   │   ├── Analytics.jsx             # `/analytics` — analytics_daily/applications summary + funnel
│   │   │   ├── MatchedJobs.jsx           # `/matched-jobs` — jobs + match_scores tables
│   │   │   ├── EngineApplications.jsx    # `/engine-applications` — applications table
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
├── 📁 browser-extension/                 # Chrome extension — manual capture + full engine dashboard
│   ├── manifest.json
│   ├── content.js / content.css          # Injects a "Save to TrackTrail" button on job postings
│   ├── background.js
│   ├── popup.html / popup.js / popup.css # Toolbar popup — quick login, tracked_jobs list, add job
│   ├── dashboard.html / dashboard.js / dashboard.css
│   │                                      # Full-page dashboard (chrome-extension://<id>/dashboard.html),
│   │                                      # sidebar-nav layout with one tab per engine table:
│   │                                      #   Matched Jobs (jobs + match_scores), Applications
│   │                                      #   (applications), Analytics (analytics_daily/applications),
│   │                                      #   Companies (companies), Sources (job_sources), Profile
│   │                                      #   (user_profile), Email (Gmail scan/import)
│   └── config.js
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
- Health-check the Postgres pool on startup ("Postgres connected")
- Setup CORS (allowlist from CLIENT_URL, plus chrome-extension:// origins)
- Mount all route modules (auth, jobs, gmail, and the engine routes)
- Centralized JSON error handler
- Start server on specified port
```

### Directory: `server/db/`

**Postgres Connection & Schema**

```javascript
// db/pg.js
- Single `pg` Pool, built from DATABASE_URL
- query(text, params) helper used by every model/route
- Logs any query slower than 200ms

// db/schema.sql
- Full schema: users, tracked_jobs (auth/tracker)
- jobs, companies, applications, match_scores,
  user_profile, job_sources, analytics_daily (engine)
- Applied via `npm run db:migrate`
```

### Directory: `server/models/`

**Postgres-backed data access** — plain async functions over the shared
connection pool (no ORM). Each function maps snake_case DB columns to the
camelCase shape the rest of the app expects.

#### `User.js` (`users` table)

```
Columns:
├── id (SERIAL PRIMARY KEY)
├── name (VARCHAR, required)
├── email (VARCHAR, unique, required)
├── password (VARCHAR, bcrypt hash, required)
├── gmail_refresh_token (TEXT, nullable)
└── created_at (TIMESTAMPTZ, auto)

Functions: findByEmail, findById, create, setGmailRefreshToken
```

#### `Job.js` (`tracked_jobs` table)

```
Columns:
├── id (SERIAL PRIMARY KEY)
├── user_id (INT, FK → users.id)
├── company (VARCHAR, required)
├── role (VARCHAR, required)
├── status (VARCHAR, default 'Applied')
├── interview_date (VARCHAR)
├── notes (TEXT)
├── created_at / updated_at (TIMESTAMPTZ, auto)

Functions: create, findAllByUser, findOneAndUpdate, findOneAndDelete
(update/delete are always scoped to the owning user_id)
```

### Directory: `server/routes/`

**API Route Definitions** — business logic lives directly in each route
handler (there is no separate `controllers/` layer).

#### `authRoutes.js` — mounted at `/api/auth`

```
POST   /api/auth/register          - Create a user
POST   /api/auth/login             - Log in, receive a JWT
```

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

#### Engine routes — `ingestRoutes.js`, `engineJobsRoutes.js`, `applyRoutes.js`, `analyticsRoutes.js`, `profileRoutes.js`

See [API_ENDPOINTS.md](API_ENDPOINTS.md) for the full list — these back the
Intelligent Job Application Engine described in
[intelligent-job-application-engine-design.md](intelligent-job-application-engine-design.md).

### Directory: `server/middleware/`

**Custom Middleware**

#### `authMiddleware.js`

- Reads the JWT from the `token` request header (not `Authorization: Bearer`)
- Verifies it and attaches the decoded payload to `req.user`
- Returns 401/400 on missing or invalid tokens

### Directories: `server/services/`, `adapters/`, `workers/`, `queue/`

These power the **Intelligent Job Application Engine** — scraping,
deduplication, TF-IDF/embedding matching, a human-in-the-loop Playwright apply
flow, and analytics aggregation, all running as BullMQ workers (`npm run
worker`) separate from the API process. See
[intelligent-job-application-engine-design.md](intelligent-job-application-engine-design.md)
for the full design.

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
/dashboard           → Dashboard        (protected)
/add-job             → JobForm          (protected)
/edit-job/:id        → JobForm          (protected)
/integrations        → Integrations     (protected)
*                    → NotFound
```

### Directory: `client/src/components/`

**Reusable UI Components**

| Component            | Purpose                                     |
| -------------------- | ------------------------------------------- |
| `Navbar.jsx`         | Top navigation bar                          |
| `Sidebar.jsx`        | Dashboard side navigation                   |
| `AuthShell.jsx`      | Shared layout wrapper for Login/Register    |
| `DashboardCards.jsx` | Summary stat cards on the dashboard         |
| `JobTable.jsx`       | Tabular job list                            |
| `ProtectedRoute.jsx` | Redirects unauthenticated users to `/login` |

### Directory: `client/src/pages/`

**Full-Page Components**

| Page               | Route                       | Purpose                           |
| ------------------ | --------------------------- | --------------------------------- |
| `Landing.jsx`      | `/`                         | Public marketing page             |
| `Login.jsx`        | `/login`                    | User authentication               |
| `Register.jsx`     | `/register`                 | Account creation                  |
| `Dashboard.jsx`    | `/dashboard`                | Main application hub              |
| `AddJob.jsx`       | —                           | Entry point used before `JobForm` |
| `JobForm.jsx`      | `/add-job`, `/edit-job/:id` | Create/edit a job                 |
| `Integrations.jsx` | `/integrations`             | Connect Gmail, scan inbox         |
| `NotFound.jsx`     | `*`                         | 404 page                          |

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
authRoutes.js → User.findByEmail / User.create (models/User.js)
    ↓
bcrypt compare/hash + jwt.sign()
    ↓
Token + user returned to client
    ↓
Stored in localStorage/sessionStorage
    ↓
Redirect to Dashboard
```

### Job Creation Flow

```
User Fills Form
    ↓
JobForm component
    ↓
api.js → POST /api/jobs   (token header attached automatically)
    ↓
jobRoutes.js → Job.create() (models/Job.js)
    ↓
INSERT INTO tracked_jobs ...
    ↓
Return created row (camelCase-mapped)
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
jobRoutes.js → Job.findAllByUser(userId)
    ↓
SELECT * FROM tracked_jobs WHERE user_id = $1
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
- **Database**: PostgreSQL (hosted) via the `pg` driver — no ORM
- **Queue**: BullMQ + Redis (matching/apply/analytics engine)
- **Automation**: Playwright (scraper + semi-automated apply)
- **Authentication**: JWT + bcryptjs

### Frontend

- **Library**: React 19
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios
- **Routing**: React Router

### Development Tools

- **Package Manager**: npm
- **Version Control**: Git
- **Environment**: Node.js development server

---

## Key Dependencies

### Backend (`server/package.json`)

```json
{
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
  "natural": "^7.1.0"
}
```

### Frontend (`client/package.json`)

```json
{
  "react": "^19.x",
  "react-router-dom": "^7.15.1",
  "axios": "^1.16.1",
  "vite": "^6.x",
  "tailwindcss": "^4.3.0"
}
```

---

## Security Considerations

### Password Security

- Hashed with bcryptjs (10 salt rounds)
- Never stored in plain text
- Validated on login

### JWT Authentication

- Token generated on login (unsigned expiry — no `expiresIn` set on the main login token)
- Sent as a plain `token` request header (not `Authorization: Bearer`)
- Verified on every protected route via `authMiddleware.js`

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
- Background work (scraping, matching, applying, analytics) already runs as
  **separate worker processes** (`npm run worker`) so a Playwright crash never
  takes the API down
- Good for small to medium usage

### Database Optimization

- Indexes on frequently queried columns (see `db/schema.sql`)
- Connection pooling via `pg.Pool`
- `analytics_daily` is a precomputed daily rollup rather than live joins on every dashboard load

### Future Directions

- Split the engine (scraping/matching/apply/analytics) into its own deployable service
- Add `pgvector` for embedding-based matching at scale (see the engine design doc)
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

---

## File Naming Conventions

### React Components

- PascalCase: `JobTable.jsx`, `AuthShell.jsx`
- One component per file
- `pages/` mirrors routes; `components/` holds shared/reusable pieces

### JavaScript Files

- camelCase: `authMiddleware.js`, `ingestionService.js`
- Functions and variables: camelCase
- Constants: UPPER_SNAKE_CASE

### CSS/Styling

- Tailwind utility classes, configured via `index.css`

---

**Last Updated**: July 20, 2026  
**Version**: 2.0.0 (PostgreSQL)
