# Getting Started Guide

Welcome to TrackTrail! This guide will help you set up and run the project.

---

## Prerequisites

Before you start, ensure you have:

- **Node.js** 18.x or higher ([Download](https://nodejs.org))
- **npm** (comes with Node.js)
- **A hosted PostgreSQL database** — e.g. [Neon](https://neon.tech), [Supabase](https://supabase.com), or Render Postgres. You just need a connection URL; there's nothing to install locally.
- **A Redis instance** — required to run the background worker process (Job Discovery, matching, apply engine, analytics rollup). Local Redis, or a hosted one like Upstash. The core manual tracker (register, login, add/edit/delete jobs) works without Redis; the worker process won't start without it.
- **Git** ([Download](https://git-scm.com))
- A code editor (VSCode recommended)

**Check your versions:**

```bash
node --version
npm --version
git --version
```

---

## Step 1: Clone the Repository

```bash
git clone <repository-url>
cd TrackTrail
```

---

## Step 2: Get a Postgres Connection String

Create a free hosted Postgres database (Neon is quickest) and copy its connection
string — it looks like:

```
postgresql://user:password@host/dbname?sslmode=require
```

You don't need to install Postgres locally — the server connects to this URL directly.

---

## Step 3: Configure Environment Variables

```bash
cd server
# Copy the template
cp .env.example .env

# Edit .env with your values
```

**Minimal `server/.env`:**

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
JWT_SECRET=your-secret-key-here
PORT=5000
CLIENT_URL=http://localhost:5173
```

Everything else in `.env.example` (Gmail, Playwright, Redis, Resend) is
optional — those features stay disabled if left blank. See
[INSTALLATION.md](INSTALLATION.md) for the full variable reference.

---

## Step 4: Install Server Dependencies & Set Up the Database

This project uses **Prisma**, not a hand-written SQL schema file.

```bash
npm install
npx prisma generate       # generates the Prisma client from schema.prisma
npx prisma migrate deploy # applies the committed migrations in prisma/migrations
```

`npx prisma migrate deploy` creates every table the app needs — `users` and
`tracked_jobs` for the auth/tracker portion, plus `jobs`, `companies`,
`applications`, `match_scores`, `user_profile`, `job_sources`, `scrape_runs`,
and `analytics_daily` for the intelligent job-application engine. Safe to
re-run.

> **Note:** `npm run db:migrate` (`node migrate.js`) still exists in
> `package.json` but is dead code left over from an earlier, pre-Prisma
> version of this project — it reads a `db/schema.sql` file that no longer
> exists in the repository and will fail if you run it. Use the Prisma
> commands above instead.

If you're actively developing and want to create a new migration from schema
changes, use `npx prisma migrate dev` instead of `deploy`.

---

## Step 5: Install Client Dependencies

```bash
cd ../client
npm install
```

If you need to point the frontend at a specific backend, set `VITE_API_BASE_URL`
in `client/.env` (defaults to `http://localhost:5000` for local dev).

---

## Step 6: Start the Development Servers

**Open two or three terminals:**

**Terminal 1 - Start Backend Server:**

```bash
cd server
npm start
```

Expected output:

```
Postgres connected
job_sources seeded (manual/linkedin/indeed/gmail/extension)
Server Running on 5000
```

**Terminal 2 - Start Frontend Client:**

```bash
cd client
npm run dev
```

Expected output:

```
➜  Local:   http://localhost:5173/
```

**Terminal 3 (recommended) - Start the background workers:**

```bash
cd server
npm run worker
```

This runs Job Discovery, matching, the apply engine, and analytics as BullMQ
workers, separate from the API process. Requires Redis (`REDIS_URL`, or it
falls back to `redis://127.0.0.1:6379`). Without this running, discovery runs
you trigger from `/job-discovery` will stay `queued` forever.

---

## Step 7: Access the Application

Open your browser and go to:

```
http://localhost:5173
```

You should see the landing page. Register a new account and start tracking!
To try Job Discovery, go to `/job-discovery` and search — Remotive works out
of the box with no extra setup; LinkedIn/Indeed will show as "unavailable"
(see the README's Job Discovery section for why).

---

## Verify Everything Works

### Backend Health Check

```bash
curl http://localhost:5000/
```

Expected: `Backend Running`

### Frontend Loading

- [ ] Login page loads
- [ ] Can create a new account
- [ ] Can log in
- [ ] Can access the dashboard
- [ ] Can add a job application
- [ ] Can trigger a Job Discovery search against Remotive (if the worker is running)

---

## Troubleshooting

### Postgres Connection Error

```
Error: connect ECONNREFUSED
```

or

```
Postgres connection error ...
```

**Solution**: Double-check `DATABASE_URL` in `server/.env` — make sure it's
the full URL from your provider (including `?sslmode=require` if it's included),
and that the database is actually reachable from wherever you're running the server.

### "Table does not exist" errors

**Solution**: Run `npx prisma migrate deploy` (see Step 4) — the schema
hasn't been applied to your database yet.

### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::5000
```

**Solution**:

```bash
# Change PORT in .env
PORT=5001

# Or kill the process using the port
# Windows:
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Mac/Linux:
lsof -i :5000
kill -9 <PID>
```

### Module Not Found

```
Error: Cannot find module 'express'
```

**Solution**:

```bash
cd server
npm install
```

### CORS Error

```
Access to XMLHttpRequest has been blocked by CORS policy
```

**Solution**: Ensure `.env` has correct `CLIENT_URL`:

```env
CLIENT_URL=http://localhost:5173
```

### Job Discovery runs stay "queued" forever

**Solution**: The worker process (`npm run worker`, Step 6) isn't running, or
can't reach Redis. Check `REDIS_URL` in `.env`. The dashboard now gives up
polling after 45 seconds of a run still showing "queued" and tells you this
directly instead of waiting silently forever — if you see that message,
this is almost certainly the cause.

### `Invalid prisma.scrapeRun.update()` / "Record to update not found" in worker logs

**Solution**: this happens if a run's history row was deleted
(`DELETE /api/scrape/runs/:id`) while its BullMQ job was still queued or
running — a real, harmless race (the run's owner just doesn't want to see
the result anymore), not data corruption. The worker and
`services/jobDiscovery/index.js` both detect this specific case (Prisma
error code `P2025`) and log it plainly instead of crashing a second time
while trying to report the first error. If you see a *different* Prisma
error here, that's a genuine bug worth investigating on its own.

### `duplicate key value violates unique constraint` on `companies.normalized_name`

**Solution**: this was a real check-then-insert race when two discovery
runs (the worker runs with `concurrency: 2`) ingested a job from the same
brand-new company at the same moment. Fixed in `services/ingestionService.js`
with an atomic `INSERT ... ON CONFLICT (normalized_name) DO UPDATE` — if
you still see this error, you're likely running an older version of that
file.

---

## Project Structure Overview

```
├── server/
│   ├── prisma/                 # schema.prisma + migrations (Prisma, not raw SQL)
│   ├── lib/                    # Shared Prisma client
│   ├── routes/                 # API endpoints
│   ├── middleware/             # Auth middleware
│   ├── services/, adapters/, workers/, queue/  # Discovery/matching/apply/analytics engine
│   ├── server.js                # Entry point
│   └── package.json
├── client/
│   ├── src/
│   │   ├── components/         # UI components
│   │   ├── pages/               # Page components
│   │   ├── api.js               # Axios instance / API calls
│   │   └── main.jsx             # Entry point
│   └── vite.config.js
├── browser-extension/           # Manifest V3 Chrome extension
└── docs/
```

See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for the full breakdown.

---

## Next Steps

1. **Explore the Dashboard** - Add some job applications, try Job Discovery
2. **Read [API_ENDPOINTS.md](API_ENDPOINTS.md)** - Learn about API endpoints
3. **Check [INSTALLATION.md](INSTALLATION.md)** - Detailed setup guide
4. **Review Code** - Explore the codebase
5. **Deploy** - Deploy to production when ready (see [DEPLOYMENT.md](DEPLOYMENT.md))

---

## Quick Commands Reference

```bash
# Start both servers (from root directory)
# Terminal 1:
cd server && npm start

# Terminal 2:
cd client && npm run dev

# Terminal 3 (background engine workers — recommended):
cd server && npm run worker

# Build for production
cd client && npm run build

# Apply Prisma migrations
cd server && npx prisma migrate deploy

# Install new package (from respective directory)
npm install package-name

# Stop server
Ctrl + C
```

---

## Need Help?

- Check [INSTALLATION.md](INSTALLATION.md) for detailed setup
- Review [API_ENDPOINTS.md](API_ENDPOINTS.md) for API documentation
- Check server console for error messages
- Verify all environment variables are set correctly

---

**Happy tracking! 🚀**
