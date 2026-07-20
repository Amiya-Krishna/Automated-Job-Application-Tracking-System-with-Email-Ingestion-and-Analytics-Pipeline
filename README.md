# Job Application Tracker Portal

[![React](https://img.shields.io/badge/React-19.x-blue?logo=react)](https://react.dev)
[![Node.js](https://img.shields.io/badge/Node.js-16.x+-green?logo=node.js)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5.x-black?logo=express)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Latest-blue?logo=postgresql)](https://www.postgresql.org)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

A full-stack job application tracker built with React, Vite, Express, and PostgreSQL. Manage job applications, track status changes, and keep interview details and notes in one place.

> **Database:** this project uses a single **hosted PostgreSQL** instance (e.g. [Neon](https://neon.tech), [Supabase](https://supabase.com), or Render Postgres) via a connection string in `PG_CONNECTION_STRING` — no local Postgres install required.

---

## 🚀 Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd "Job Application Tracker Portal"

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

# Apply the schema to that hosted database
cd server
npm run db:migrate

# Start server in one terminal
npm start

# Start client in another terminal
cd ../client
npm run dev
```

Open the frontend at `http://localhost:5173`

---

## 📋 Installation Steps

### Prerequisites
- Node.js 16.x or higher
- A hosted PostgreSQL database (Neon, Supabase, Render, etc.) — a connection URL, no local Postgres install needed
- npm package manager

### Server Setup

```bash
cd server
npm install
```

### Client Setup

```bash
cd client
npm install
```

### Environment Configuration

```env
PG_CONNECTION_STRING=postgresql://user:password@host/dbname?sslmode=require
JWT_SECRET=your_jwt_secret_key_here
NODE_ENV=development
PORT=5000
CLIENT_URL=https://job-application-tracker-portal-ao8n.vercel.app,http://localhost:5173
```

Then apply the schema once to that database:

```bash
cd server
npm run db:migrate
```

### Run Application

**Development Mode**

```bash
# Server
cd server
npm start

# Client
cd client
npm run dev
```

**Production Build**

```bash
cd client
npm run build
cd ../server
npm start
```

---

### 🟢 System Architecture

![System Architecture](outputs/system_architecture.png)

### 🟢 Data Flow

![Data Flow](outputs/data_flow.png)

### 🟢 Authentication Flow

![Authentication Flow](outputs/authentication_flow.png)


---

## ⚙️ Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PG_CONNECTION_STRING` | Hosted PostgreSQL connection URL | `postgresql://user:pass@host/db?sslmode=require` |
| `JWT_SECRET` | Secret key for JWT signing | `your_secret_key_12345` |
| `NODE_ENV` | App environment | `development` or `production` |
| `PORT` | Backend port | `5000` |
| `CLIENT_URL` | Frontend URL for CORS | `http://localhost:5173` |

---

## 🔌 API Endpoints

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Register a new user | ❌ |
| POST | `/api/auth/login` | Login and receive JWT token | ❌ |

### Job Applications

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/jobs` | Get all jobs for the authenticated user | ✅ |
| POST | `/api/jobs` | Create a new job entry | ✅ |
| PUT | `/api/jobs/:id` | Update job details | ✅ |
| DELETE | `/api/jobs/:id` | Remove a job entry | ✅ |

> Protected routes require the request header `token: <JWT token>`.

---

## ✨ Features

- **Authentication**
  - User registration
  - Login with JWT
  - Password hashing with bcryptjs
- **Job Tracking**
  - Create, update, and delete job applications
  - Track company, role, status, interview date, and notes
  - User-specific data isolation
- **Modern Frontend**
  - React 19 with Vite
  - React Router navigation
  - Responsive UI with Tailwind CSS
  - API integration via Axios
- **Backend**
  - Express 5 server
  - PostgreSQL (hosted) via the `pg` driver
  - Protected routes using middleware

---

## 📸 Screenshots

### 🟢 Dashboard

![Dashboard](outputs/Dashboard.png)

### 🚀 Login 

![Login](outputs/Login_Page.png)

### 🚀 Registration

![Registration](outputs/Registration_Page.png)

### 🟢 Postman

![Postman](outputs/Postman%20request.png)

### 🚀 Server

![Server](outputs/Server_terminal.png)

---

## 📁 Project Structure
```
Job Application Tracker Portal/
|
├── client/                          # React frontend
│   ├── src/
│   │   ├── components/              # Reusable React components
│   │   ├── pages/                   # Page components
│   │   ├── App.jsx                  # Main app component
│   │   ├── main.jsx                 # Frontend entry point
│   │   └── index.css                # Global styles
│   ├── package.json                 # Client dependencies and scripts
│   └── vite.config.js               # Vite configuration
|
├── server/                          # Node backend
│   ├── db/                          # Postgres pool + schema.sql
│   ├── middleware/                  # Auth middleware
│   ├── models/                      # Postgres-backed models (User, Job)
│   ├── routes/                      # API route definitions
│   ├── package.json                 # Server dependencies and scripts
│   └── server.js                    # Backend entry point
|
├── docs/                            # Project documentation
├── .env.example                     # Environment variable template
└── README.md                        # Project documentation
```

---

---

## 🧠 Intelligent Job Application Engine (new)

This upgrade adds a decision-based, semi-automated engine alongside the original tracker.
It lives in `server/` as new modules, sharing the same Express app **and the same Postgres
database** as the auth/tracker routes above — everything in this project now runs on a
single hosted PostgreSQL instance (see `db/schema.sql` for the full schema, including the
`users`/`tracked_jobs` tables used by the tracker).

**New pieces:**
- `db/schema.sql` — Postgres schema (jobs, companies, applications, match_scores, user_profile, job_sources, analytics_daily)
- `services/ingestionService.js` — shared entrypoint for both capture paths (Playwright scraper + this repo's existing browser extension), does normalize → dedup → insert → enqueue match
- `services/dedupService.js` — exact hash + fuzzy (Jaro-Winkler title + TF-IDF description) duplicate detection
- `services/matchingService.js` — free-tier TF-IDF + keyword matcher (`scoreTfIdf`), plus an embeddings-based scorer (`scoreEmbedding`) that takes an injected `embedFn` so it isn't tied to one provider
- `services/learningService.js` — nudges per-skill weights up/down based on interview/offer/rejection outcomes
- `services/applyEngine.js` + `adapters/` — Playwright-driven, human-in-the-loop apply flow; stops before the final submit click
- `services/rateLimiter.js` — Redis token bucket, capped per target domain, plus randomized human-like delays
- `services/scraper.js` — scheduled LinkedIn/Indeed scraper skeleton (selectors will need upkeep — see comments in the file)
- `workers/` + `worker.js` — BullMQ workers (match, apply, analytics), run as a **separate process** from the API (`npm run worker`) so a Playwright crash never takes the API down
- `routes/ingestRoutes.js`, `engineJobsRoutes.js`, `applyRoutes.js`, `analyticsRoutes.js`, `profileRoutes.js` — new REST surface, mounted at `/api/ingest`, `/api/engine/jobs`, `/api/applications`, `/api/analytics`, `/api/profile`

### Setup

```bash
cd server
npm install                       # installs pg, bullmq, ioredis, natural, playwright
npx playwright install chromium   # one-time browser download for the apply engine/scraper
cp .env              # fill in PG_CONNECTION_STRING and REDIS_URL
npm run db:migrate                # applies db/schema.sql (users, tracked_jobs, jobs, etc.) to your Postgres instance

# terminal 1: API (unchanged)
npm start

# terminal 2: background workers (new — required for matching/apply/analytics to run)
npm run worker

# one-off: seed your profile so the matcher has something to compare against
curl -X POST http://localhost:5000/api/profile \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Your Name","email":"you@example.com","resumeText":"...","skills":["react","node.js","postgresql"]}'

# one-off / cron: run a scrape pass
npm run scrape "backend developer intern"
```

Requires a hosted **PostgreSQL** connection string (`PG_CONNECTION_STRING`) and a local or
hosted **Redis** instance for the queue (`REDIS_URL`/`REDIS_HOST`). Nothing needs to be
installed locally for Postgres — just point the connection string at your hosted database.

### What's a skeleton vs. fully built

The Greenhouse adapter's field selectors are illustrative (extend `adapters/` per real ATS
you encounter), the embeddings matcher needs an `embedFn` wired to whichever provider you
pick, and the LinkedIn/Indeed scraper's selectors will need periodic upkeep as those sites
change their DOM — all called out in comments at the top of the relevant files.

---

## 🤝 Contributing

Contributions are welcome.

1. Fork the repository
2. Create a branch: `git checkout -b feature/name`
3. Make your changes
4. Commit and push
5. Open a pull request

---

## 📄 License

This project is licensed under the **MIT License**.

---

## 👨‍💻 Author

Amiya Krishna Chaurasiya

B.Tech CSE Student

Aspiring Data Scientist and AI/ML Engineer

GitHub: https://github.com/Amiya-Krishna

LinkedIn: https://www.linkedin.com/in/amiya-krishna

---

## ⭐ Support

If you like this project:

⭐ Star the repository
🍴 Fork it
🤝 Contribute