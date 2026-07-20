# Getting Started Guide

Welcome to the Job Application Tracker Portal! This guide will help you set up and run the project in less than 10 minutes.

---

## Prerequisites

Before you start, ensure you have:

- **Node.js** 16.x or higher ([Download](https://nodejs.org))
- **npm** (comes with Node.js)
- **A hosted PostgreSQL database** — e.g. [Neon](https://neon.tech), [Supabase](https://supabase.com), or Render Postgres. You just need a connection URL; there's nothing to install locally.
- **A Redis instance** (for the background job queue used by the matching/apply/analytics engine) — local Redis, or a hosted one like Upstash
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
cd "Job Application Tracker Portal"
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
PG_CONNECTION_STRING=postgresql://user:password@host/dbname?sslmode=require
JWT_SECRET=your-secret-key-here
PORT=5000
CLIENT_URL=https://job-application-tracker-portal-ten.vercel.app,http://localhost:5173
```

---

## Step 4: Install Server Dependencies & Apply the Schema

```bash
npm install
npm run db:migrate   # applies server/db/schema.sql to your Postgres database
```

`db:migrate` creates every table the app needs — `users` and `tracked_jobs` for
the auth/tracker portion, plus `jobs`, `companies`, `applications`,
`match_scores`, `user_profile`, `job_sources`, and `analytics_daily` for the
intelligent job-application engine. It's safe to re-run.

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

**Open two terminals:**

**Terminal 1 - Start Backend Server:**
```bash
cd server
npm start
```

Expected output:
```
Server Running on 5000
Postgres connected
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

*(Optional)* If you want the matching/apply/analytics engine running in the
background, open a third terminal:
```bash
cd server
npm run worker
```

---

## Step 7: Access the Application

Open your browser and go to:
```
http://localhost:5173
```

You should see the landing page. Register a new account and start tracking!

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
- [ ] Can access dashboard
- [ ] Can add a job application

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
**Solution**: Double-check `PG_CONNECTION_STRING` in `server/.env` — make sure it's
the full URL from your provider (including `?sslmode=require` if it's included),
and that the database is actually reachable from wherever you're running the server.

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
CLIENT_URL=https://job-application-tracker-portal-ten.vercel.app,http://localhost:5173
```

---

## Project Structure Overview

```
├── server/
│   ├── db/                  # Postgres pool + schema.sql
│   ├── models/               # Postgres-backed User & Job models
│   ├── routes/                # API endpoints
│   ├── middleware/            # Auth middleware
│   ├── services/, adapters/, workers/, queue/  # Matching/apply/analytics engine
│   ├── server.js               # Entry point
│   └── package.json
├── client/
│   ├── src/
│   │   ├── components/       # UI components
│   │   ├── pages/            # Page components
│   │   ├── api.js            # Axios instance / API calls
│   │   └── main.jsx          # Entry point
│   └── vite.config.js
├── browser-extension/        # Chrome extension for manual job capture
└── docs/
```

---

## Next Steps

1. **Explore the Dashboard** - Add some job applications
2. **Read [API_ENDPOINTS.md](API_ENDPOINTS.md)** - Learn about API endpoints
3. **Check [INSTALLATION.md](INSTALLATION.md)** - Detailed setup guide
4. **Review Code** - Explore the codebase
5. **Deploy** - Deploy to production when ready

---

## Quick Commands Reference

```bash
# Start both servers (from root directory)
# Terminal 1:
cd server && npm start

# Terminal 2:
cd client && npm run dev

# Terminal 3 (optional, engine background workers):
cd server && npm run worker

# Build for production
cd client && npm run build

# Apply/re-apply the Postgres schema
cd server && npm run db:migrate

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
