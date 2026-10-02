# Setup, Installation & Contributing Guide

Welcome to TrackTrail! This guide covers prerequisites, installation, configuration, running, verifying and troubleshooting the project, followed by the contributing guidelines.

> **Consolidated from:** `GETTING_STARTED.md`, `INSTALLATION.md` (Last Updated: August 25, 2026) and `CONTRIBUTING.md` (Last Updated: July 20, 2026).
> The project structure overview that appeared in `GETTING_STARTED.md` is covered by the full directory tree in `01_Project_Structure_and_Architecture.md`.

---

## Table of Contents

1. [Prerequisites & System Requirements](#1-prerequisites--system-requirements)
2. [Pre-Installation Checklist](#2-pre-installation-checklist)
3. [Setup Steps](#3-setup-steps)
4. [Environment Variables](#4-environment-variables)
5. [Running the Application](#5-running-the-application)
6. [Verification](#6-verification)
7. [Troubleshooting](#7-troubleshooting)
8. [Quick Commands Reference](#8-quick-commands-reference)
9. [Next Steps](#9-next-steps)
10. [Contributing Guide](#10-contributing-guide)

---

## 1. Prerequisites & System Requirements

### Minimum requirements

| Requirement | Version | Download |
| ----------- | ------- | -------- |
| Node.js | 18.x or higher | [nodejs.org](https://nodejs.org) |
| npm | 9.x or higher | Comes with Node.js |
| PostgreSQL | Hosted instance (Neon, Supabase, Render, etc.) | No local install needed — just a connection URL |
| Redis | Local or hosted (Upstash, etc.) — required for the worker process | [redis.io](https://redis.io) |
| Git | Latest | [git-scm.com](https://git-scm.com) |

- **A hosted PostgreSQL database** — e.g. [Neon](https://neon.tech), [Supabase](https://supabase.com), or Render Postgres. You just need a connection URL; there's nothing to install locally.
- **A Redis instance** — required to run the background worker process (Job Discovery, matching, apply engine, analytics rollup). Local Redis, or a hosted one like Upstash. The core manual tracker (register, login, add/edit/delete jobs) works without Redis; the worker process won't start without it.
- A code editor (VSCode recommended).

### Recommended specifications

- **OS**: Windows 10+, macOS 10.15+, or Ubuntu 20.04+
- **RAM**: 4GB minimum
- **Storage**: 2GB free space
- **Browser**: Chrome, Firefox, Safari, or Edge (latest versions)

---

## 2. Pre-Installation Checklist

- [ ] Node.js installed and accessible via terminal
- [ ] npm installed
- [ ] A hosted PostgreSQL connection string ready (no local Postgres install needed)
- [ ] A Redis instance ready (local or hosted) if you plan to run the background workers
- [ ] Git installed
- [ ] Code editor (VSCode recommended)
- [ ] 2GB free disk space
- [ ] Stable internet connection

**Verify installations:**

```bash
# Check Node.js version
node --version
# Expected: v18.0.0 or higher

# Check npm version
npm --version
# Expected: 9.0.0 or higher

# Check Git version
git --version
# Expected: git version 2.x.x or higher
```

---

## 3. Setup Steps

### Step 1: Clone the repository

```bash
git clone <repository-url>
cd TrackTrail
```

### Step 2: Get a Postgres connection string

This project uses a **single hosted PostgreSQL database** — there is no local Postgres server to install or run. Create a free hosted Postgres database (Neon is quickest) and copy its connection string — it looks like:

```
postgresql://user:password@host/dbname?sslmode=require
```

Pick any provider that gives you a connection URL:

- **Option A: Neon (recommended — generous free tier)**
  1. Go to [neon.tech](https://neon.tech) and create a free account.
  2. Create a project/database.
  3. Copy the connection string shown in the dashboard (it already includes `?sslmode=require`).
- **Option B: Supabase**
  1. Go to [supabase.com](https://supabase.com) and create a free project.
  2. Go to **Project Settings → Database** and copy the connection string (use the "Connection pooling" URI for serverless-style usage, or the direct URI for a long-running server).
- **Option C: Render Postgres**
  1. In the [Render dashboard](https://render.com), create a new **PostgreSQL** instance.
  2. Copy the **External Connection String** (or **Internal** if your app is also hosted on Render).

### Step 3: Install server dependencies

```bash
cd TrackTrail
cd server
npm install
```

Expected output:

```
added XXX packages, and audited XXX packages in Xs
```

Verify the installation (shows all installed packages and their versions):

```bash
npm list
```

### Step 4: Configure server environment variables

```bash
cd server
# Copy the template
cp .env.example .env

# Edit .env with your values
```

Edit `.env` with your Postgres connection string, JWT secret, and (optionally) Gmail/Redis/Resend configuration — see [Environment Variables](#4-environment-variables) below.

### Step 5 (one-time): Set up the database with Prisma

This project uses **Prisma**, not a hand-written SQL schema file.

```bash
npx prisma generate       # generates the Prisma client from prisma/schema.prisma
npx prisma migrate deploy # applies the committed migrations in prisma/migrations against DATABASE_URL
```

`npx prisma migrate deploy` creates every table the app needs — `users` and `tracked_jobs` for the auth/tracker portion, plus `jobs`, `companies`, `applications`, `match_scores`, `user_profile`, `job_sources`, `scrape_runs`, and `analytics_daily` for the intelligent job-application engine. Safe to re-run.

> **Note:** `npm run db:migrate` (`node migrate.js`) still exists in `package.json` but is dead code left over from an earlier, pre-Prisma version of this project — it reads a `db/schema.sql` file that no longer exists in the repository and will fail if you run it. Use the Prisma commands above instead.

If you're actively developing and want to create a new migration from schema changes, use `npx prisma migrate dev` instead of `deploy`.

**Verify the database connection.** After applying the schema, start the server from the `server` directory:

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

### Step 6: Install client dependencies

```bash
cd client
npm install
```

Expected output:

```
added XXX packages, and audited XXX packages in Xs
```

Verify the installation:

```bash
npm list
```

**Optional environment configuration.** If you need to point the frontend at a specific backend, create/edit `.env` in the `client` directory (set `VITE_API_BASE_URL` in `client/.env`):

```env
VITE_API_BASE_URL=https://your-deployed-backend.example.com
```

Falls back to `http://localhost:5000` if unset (the default for local dev).

---

## 4. Environment Variables

### Minimal `server/.env`

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
JWT_SECRET=your-secret-key-here
PORT=5000
CLIENT_URL=http://localhost:5173
```

Everything else in `.env.example` (Gmail, Playwright, Redis, Resend) is optional — those features stay disabled if left blank.

### Full reference `server/.env`

```env
# ===== DATABASE (required) =====
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# ===== SERVER (required) =====
PORT=5000
JWT_SECRET=your_super_secret_key_min_32_characters_long_here_12345
CLIENT_URL=http://localhost:5173

# ===== REDIS (optional, but required to run `npm run worker`) =====
REDIS_URL=

# ===== GMAIL INTEGRATION (optional — leave blank to disable) =====
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# ===== PLAYWRIGHT APPLY ENGINE (optional) =====
PLAYWRIGHT_PROFILE_DIR=./playwright-profile
PLAYWRIGHT_HEADLESS=true
# Required for LinkedIn/Indeed Job Discovery and the Playwright apply engine
# Install once after npm install: npx playwright install chromium

# ===== FORGOT-PASSWORD EMAILS (optional) =====
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# ===== LEGACY LINKEDIN/INDEED PARTNER API SETTINGS (optional) =====
# These are retained for older deployments/configuration only. The active
# LinkedIn/Indeed discovery path uses Playwright and does not require them.
LINKEDIN_TALENT_API_TOKEN=
INDEED_PARTNER_FEED_URL=
```

The variables below are legacy compatibility settings; the current LinkedIn/Indeed discovery path uses Playwright and does not require partner API credentials.

Remotive (the working Job Discovery provider) needs **no environment variable at all** — it's a public API with no auth requirement.

### Variable definitions

| Variable | Required? | Purpose |
| -------- | --------- | ------- |
| `DATABASE_URL` | Required | Hosted Postgres connection URL (used via Prisma) — used by everything, auth included |
| `PORT` | Required | Server port |
| `JWT_SECRET` | Required | Token secret (min 32 chars) |
| `CLIENT_URL` | Required | Frontend URL(s) for CORS, comma-separated |
| `REDIS_URL` | Optional (required for `npm run worker`) | Queue backend for discovery/matching/apply/analytics; defaults to `redis://127.0.0.1:6379` if unset |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Optional | Gmail OAuth — see [09_Gmail_Integration_and_Resume_Tailoring.md](09_Gmail_Integration_and_Resume_Tailoring.md) |
| `PLAYWRIGHT_PROFILE_DIR` / `PLAYWRIGHT_HEADLESS` | Optional | Playwright browser/session config for apply automation and LinkedIn/Indeed discovery |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Optional | Forgot-password emails; skipped (logged, not sent) if unset |
| `SERVER_URL` / `EXTENSION_REDIRECT_URL` | Optional | Gmail OAuth redirect handling for the browser extension flow |
| `LINKEDIN_TALENT_API_TOKEN` / `INDEED_PARTNER_FEED_URL` | Optional, provider-specific | Only flips an availability flag — no real API call is implemented behind either yet |

Production, mobile and AI-provider variables are documented with their components: `05` (deployment), `06` (web), `07` (mobile) and `09` (AI providers).

**Security Note**: Never commit `.env` to version control. It's already in `.gitignore`.

---

## 5. Running the Application

### Prerequisites met?

- [ ] Node.js and npm installed
- [ ] `DATABASE_URL` configured and schema applied (`npx prisma migrate deploy`)
- [ ] `.env` file configured
- [ ] Dependencies installed for both server and client

### Method 1: Running locally (development)

Open two or three terminals.

**Terminal 1 — Start backend server:**

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

**Terminal 2 — Start frontend client:**

```bash
cd client
npm run dev
```

Expected output:

```
  VITE v6.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

**Terminal 3 (recommended) — Start the background workers:**

```bash
cd server
npm run worker
```

This runs Job Discovery, matching, the apply engine, and analytics as BullMQ workers, separate from the API process. Requires Redis to be reachable (`REDIS_URL`, or it falls back to `redis://127.0.0.1:6379`). Required if you want Job Discovery, matching, the apply engine, and analytics rollups running — the core tracker (register, login, add/edit/delete jobs) works without it. Without this running, discovery runs you trigger from `/job-discovery` will stay `queued` forever.

### Method 2: Production build

```bash
# Build frontend
cd client
npm run build

# Start server
cd ../server
npm start
```

### Access the application

Open your browser and go to:

```
http://localhost:5173
```

You should see the landing page. Register a new account and start tracking! To try Job Discovery, go to `/job-discovery` and search. Remotive works through its public API; LinkedIn and Indeed launch Playwright and require Chromium to be installed on the worker host (`npx playwright install chromium`). Provider-side blocking or markup changes are surfaced in the per-source run result.

---

## 6. Verification

### Step 1: Check server health

```bash
curl http://localhost:5000/
```

Expected: `Backend Running`

### Step 2: Access the frontend

Open `http://localhost:5173`. Expected: landing/login page loads without errors.

### Step 3: Test authentication

1. Click "Register"
2. Create account with:
   - Name: `Test User`
   - Email: `test@example.com`
   - Password: `Test@1234`
3. Submit

Expected: Account created, then redirected to log in.

### Step 4: Log in

Use the credentials from Step 3. Expected: Dashboard loads successfully.

### Step 5: Test job creation

1. Click "Add Job"
2. Fill in the form:
   - Company: `Test Corp`
   - Role: `Developer`
   - Status: `Applied`
3. Save

Expected: Job appears in your Applied Jobs list.

### Step 6: Test Job Discovery (optional, requires the worker running)

1. Go to `/job-discovery`
2. Search for a role (Remotive is on by default)
3. Poll status until it reaches `succeeded`

Expected: Remotive listings appear; LinkedIn/Indeed attempt browser discovery when selected and report either `ok` results or an explicit provider/browser error or blocked status.

### Verification checklist

- [ ] Server running on port 5000
- [ ] Frontend running on port 5173
- [ ] Postgres connected (check server startup log)
- [ ] Login page loads / is accessible
- [ ] Can create a new account (registration works)
- [ ] Can log in
- [ ] Can access the dashboard (dashboard displays)
- [ ] Can add a job application
- [ ] Can trigger a Job Discovery search against Remotive (if the worker is running)
- [ ] Can trigger LinkedIn/Indeed discovery after `npx playwright install chromium` (if the worker is running)
- [ ] No console errors

---

## 7. Troubleshooting

### "Cannot find module" errors

```
Error: Cannot find module 'express'
```

**Solution:**

```bash
cd server
npm install
```

If that does not help, delete `node_modules` and reinstall:

```bash
# Delete node_modules and reinstall
rm -r node_modules
npm install

# Clear npm cache
npm cache clean --force
```

### Postgres connection error

```
Error: connect ECONNREFUSED
```

or

```
Postgres connection error ...
```

**Solution:**

- Double-check `DATABASE_URL` in `server/.env` — make sure it's the exact, full URL your provider gave you (including `?sslmode=require` if it's included / if your provider needs it — most hosted providers do), and that the database is actually reachable from wherever you're running the server.
- Confirm the database is active (some free tiers pause after inactivity).
- Run `npx prisma migrate deploy` again to confirm the schema applied cleanly.

### "Table does not exist" / Prisma errors on startup

**Solution**: Run `npx prisma generate && npx prisma migrate deploy` — the Prisma client or the database schema hasn't been set up/applied to your database yet.

### Port already in use

```
Error: listen EADDRINUSE: address already in use :::5000
```

**Solution**:

```bash
# Change PORT in .env
PORT=5001

# Or kill the process using the port
# Windows - Find and kill process:
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Mac/Linux - Find and kill process:
lsof -i :5000
kill -9 <PID>
```

### CORS errors

```
Access to XMLHttpRequest has been blocked by CORS policy
```

**Solution**: Ensure `.env` has the correct `CLIENT_URL`:

```env
CLIENT_URL=http://localhost:5173
```

Restart the server after changing.

### Environment variables not loading

**Error:** `process.env.X is undefined`

**Solution:**

1. Make sure the `.env` file exists inside `server/`
2. Restart the server after creating/modifying `.env`
3. Check the file is named exactly `.env` (not `.env.example`)

### `npm install` takes too long

**Solution:**

```bash
# Clear cache
npm cache clean --force

# Try with legacy peer deps
npm install --legacy-peer-deps

# Use npm ci instead
npm ci
```

### React/Vite not starting

**Error:** `TypeError: Cannot read properties of undefined`

**Solution:**

```bash
cd client
npm install
npm run dev
```

### Login not working

**Causes & solutions:**

1. Check `JWT_SECRET` in `.env` is set
2. Confirm `npx prisma migrate deploy` ran successfully (the `users` table must exist)
3. Check the browser console for errors
4. Restart both servers

### Job Discovery runs stay "queued" forever

**Solution**: The worker process (`npm run worker`, Section 5) isn't running, or can't reach Redis. Check `REDIS_URL` in `.env` and start the worker in a third terminal. The dashboard now gives up polling after 45 seconds of a run still showing "queued" and tells you this directly instead of waiting silently forever — if you see that message, this is almost certainly the cause.

### `Invalid prisma.scrapeRun.update()` / "Record to update not found" in worker logs

**Solution**: this happens if a run's history row was deleted (`DELETE /api/scrape/runs/:id`) while its BullMQ job was still queued or running — a real, harmless race (the run's owner just doesn't want to see the result anymore), not data corruption. The worker and `services/jobDiscovery/index.js` both detect this specific case (Prisma error code `P2025`) and log it plainly instead of crashing a second time while trying to report the first error. If you see a *different* Prisma error here, that's a genuine bug worth investigating on its own.

### `duplicate key value violates unique constraint` on `companies.normalized_name`

**Solution**: this was a real check-then-insert race when two discovery runs (the worker runs with `concurrency: 2`) ingested a job from the same brand-new company at the same moment. Fixed in `services/ingestionService.js` with an atomic `INSERT ... ON CONFLICT (normalized_name) DO UPDATE` — if you still see this error, you're likely running an older version of that file.

### Getting help

1. **Check console errors**
   - Browser: F12 → Console
   - Server: the terminal where `npm start` runs
2. **Verify all services**
   - Postgres: reachable via `DATABASE_URL`
   - Server: terminal shows "Server Running on 5000" and "Postgres connected"
   - Frontend: terminal shows "Local: http://localhost:5173"
3. **Check ports**
   - Server: http://localhost:5000
   - Client: http://localhost:5173
4. Check the server console for error messages, and verify all environment variables are set correctly.

---

## 8. Quick Commands Reference

```bash
# Install all dependencies (from the respective directory)
npm install

# Install a new package (from the respective directory)
npm install package-name

# Set up / re-apply the Prisma schema
cd server && npx prisma generate
cd server && npx prisma migrate deploy

# Start both servers (from root directory)
# Terminal 1:
cd server && npm start

# Terminal 2:
cd client && npm run dev

# Terminal 3 (background engine workers — recommended):
cd server && npm run worker

# Build for production
cd client && npm run build
npm run build

# Stop server
Ctrl + C

# Update npm
npm install -g npm@latest

# Check for security vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix
```

---

## 9. Next Steps

1. ✅ Installation complete
2. **Explore the dashboard** — add some job applications, try Job Discovery
3. 📚 Read the API reference: `04_API_Reference.md` — learn about the API endpoints
4. 💻 Review the code / explore the codebase: `01_Project_Structure_and_Architecture.md`
5. 🚀 Deploy to production when ready: `05_Deployment_and_Operations.md`

**Happy tracking! 🚀**

---

## 10. Contributing Guide

Thank you for your interest in contributing to the Job Application Tracker Portal! This guide will help you get started.

---

### Code of Conduct

- Be respectful and inclusive
- Accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

---

### How Can I Contribute?

#### Reporting Bugs 🐛

Found a bug? Please report it by:

1. **Check existing issues** - Avoid duplicate reports
2. **Create detailed report** - Include:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Screenshots (if applicable)
   - Environment info (OS, browser, Node version)

**Example Issue Title:**
```
"Login fails when email contains plus sign"
```

**Example Issue Body:**
```
**Steps to Reproduce:**
1. Go to register page
2. Enter email: user+test@example.com
3. Fill other fields
4. Click submit

**Expected:** Account created successfully
**Actual:** Email validation error

**Environment:**
- OS: Windows 10
- Browser: Chrome 120
- Node: 18.17.0
```

#### Suggesting Features 💡

Have an idea? We'd love to hear it!

1. **Check existing feature requests** - Avoid duplicates
2. **Describe the feature**:
   - Use case
   - Expected behavior
   - Potential implementation approach
   - Benefits

**Example Feature Request:**
```
Title: "Add interview scheduling calendar"

Description:
Users need to track interview dates easily. A calendar 
view would help visualize schedules and set reminders.

Benefits:
- Never miss an interview
- Better time management
- Visual schedule overview
```

#### Improving Documentation 📚

- Fix typos
- Clarify confusing sections
- Add examples
- Improve formatting
- Update outdated information

#### Submitting Code Changes 💻

---

### Getting Started with Development

#### 1. Fork & Clone

```bash
# Fork on GitHub, then:
git clone https://github.com/YOUR_USERNAME/job-tracker.git
cd "Job Application Tracker Portal"
```

#### 2. Create Feature Branch

```bash
git checkout -b feature/your-feature-name
```

**Branch naming:**
- `feature/add-export-csv` - New feature
- `fix/login-validation` - Bug fix
- `docs/improve-readme` - Documentation
- `refactor/api-cleanup` - Refactoring

#### 3. Setup Development Environment

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Copy environment template
cp .env.example .env

# Update .env with your settings
```

#### 4. Make Your Changes

Follow these guidelines:

##### Code Style
- Use consistent indentation (2 spaces)
- Use meaningful variable names
- Add comments for complex logic
- Keep functions focused and small

##### Frontend (React)
```javascript
// ✅ Good
const handleUserLogin = async (email, password) => {
  try {
    const response = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", response.data.token);
    navigate('/dashboard');
  } catch (error) {
    setError(error.response?.data?.message || error.message);
  }
};

// ❌ Bad
const h = async (e, p) => {
  const r = await api.post("/auth/login", { email: e, password: p });
  setU(r.d);
};
```

##### Backend (Node.js)

This project keeps route logic directly in `routes/*.js` (there's no separate
`controllers/` layer) and uses **Prisma** as the ORM (`server/prisma/schema.prisma`,
via the shared client in `server/lib/prisma.js`) — not raw `pg` queries or
hand-written model files. Follow that pattern:

```javascript
// ✅ Good — server/routes/jobRoutes.js style
const prisma = require("../lib/prisma");

router.post("/", auth, async (req, res) => {
  try {
    const { company, role, status, interviewDate, notes } = req.body;

    if (!company || !role) {
      return res.status(400).json({ message: "company and role are required" });
    }

    const job = await prisma.trackedJob.create({
      data: {
        userId: req.user.id,
        company,
        role,
        status,
        interviewDate,
        notes,
      },
    });

    res.json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ❌ Bad — don't bypass Prisma with a raw pg query for something this simple,
// and don't forget to scope by req.user.id on user-owned tables
router.post("/", (req, res) => {
  pool.query("INSERT INTO tracked_jobs (company, role) VALUES ($1, $2)", [req.body.company, req.body.role]);
  res.json({ ok: true });
});
```

For aggregate/analytics-style queries where Prisma's query builder is
awkward, this codebase uses `prisma.$queryRawUnsafe` via the `query()` helper
exported from `server/lib/prisma.js` (see `services/analyticsService.js` for
an example) rather than reaching for a separate `pg` pool.

#### 5. Test Your Changes

```bash
# Manual testing
npm run dev  # Frontend
npm start    # Backend

# Test the feature thoroughly
# Check console for errors
# Test on different browsers if frontend changes
```

#### 6. Commit Your Changes

```bash
git add .
git commit -m "feat: add export jobs as CSV"
```

**Commit message format:**
```
<type>: <description>

<optional body>
<optional footer>
```

**Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Code style (formatting)
- `refactor:` - Code refactoring
- `test:` - Tests
- `chore:` - Build, dependencies

**Examples:**
```bash
git commit -m "feat: add job search by position"
git commit -m "fix: resolve login validation bug"
git commit -m "docs: update API endpoint examples"
git commit -m "refactor: extract auth logic to service"
```

#### 7. Push to Your Fork

```bash
git push origin feature/your-feature-name
```

#### 8. Create Pull Request

1. Go to original repository on GitHub
2. Click "New Pull Request"
3. Select your branch
4. Fill in the description:

**PR Template:**
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update

## Related Issues
Fixes #123

## Changes Made
- Added search functionality
- Updated database schema
- Added unit tests

## Screenshots
[If applicable]

## Checklist
- [ ] Code follows project style
- [ ] No new warnings generated
- [ ] Tests pass locally
- [ ] Documentation updated
- [ ] No breaking changes
```

#### 9. Respond to Feedback

- Address review comments
- Make requested changes
- Push updates to same branch
- PR automatically updates

---

### Development Workflow Example

```bash
# 1. Create feature branch
git checkout -b feature/add-filters

# 2. Make changes
# ... edit files ...

# 3. Test changes
npm run dev  # Test frontend
npm test     # Run tests if available

# 4. Commit changes
git add .
git commit -m "feat: add advanced job filters"

# 5. Push to fork
git push origin feature/add-filters

# 6. Create Pull Request on GitHub
# ... wait for review ...

# 7. Make requested changes
# ... edit files ...

# 8. Commit and push updates
git add .
git commit -m "refactor: improve filter performance"
git push origin feature/add-filters

# 9. PR merged! 🎉
```

---

### Coding Standards

#### React Components

```javascript
// Use functional components
const JobCard = ({ job, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);

  const handleEdit = () => {
    // Implementation
  };

  return (
    <div className="job-card">
      {/* JSX */}
    </div>
  );
};

export default JobCard;
```

#### Error Handling

```javascript
// Backend — this project returns the resource or a { message } object,
// not a { success, data } envelope
try {
  const jobs = await Job.findAllByUser(req.user.id);
  res.json(jobs);
} catch (err) {
  res.status(500).json({ message: err.message });
}

// Frontend — pages call api.js directly (no separate service layer)
const [error, setError] = useState(null);

const handleSubmit = async (data) => {
  try {
    setError(null);
    await api.post("/jobs", data);
  } catch (err) {
    setError(err.response?.data?.message || "Something went wrong");
  }
};
```

#### Comments

```javascript
// Add comments for WHY, not WHAT
// ✅ Good - Explains why
// We use exponential backoff to avoid overwhelming
// the server during high traffic periods
const backoffDelay = Math.pow(2, retryCount) * 1000;

// ❌ Bad - Just restates the code
// Multiply retry count by 2 and 1000
const backoffDelay = Math.pow(2, retryCount) * 1000;
```

---

### File Organization

#### New Files
- Place in appropriate directory
- Follow naming conventions
- Add to relevant route/export files

#### Modified Files
- Update related tests
- Update relevant documentation
- Update TypeScript types if applicable

---

### Pull Request Review Process

1. **Automated checks**
   - Code style validation
   - Build verification
   - Tests pass

2. **Code review**
   - Maintainers review code
   - Feedback provided if needed

3. **Approval**
   - Changes approved
   - PR merged

4. **Release**
   - Changes included in next release

---

### Common Mistakes to Avoid

- ❌ Committing sensitive data (.env, secrets)
- ❌ Large commits that are hard to review
- ❌ Poor commit messages
- ❌ Not testing before submitting PR
- ❌ Ignoring linting warnings
- ❌ Making unrelated changes in one PR
- ❌ Force-pushing to shared branches

---

### Getting Help

- **Questions?** Open a discussion
- **Stuck?** Ask in comments on related issues
- **Need guidance?** Check documentation in `/docs`
- **Still stuck?** Comment on your PR

---

### Recognition

Contributors are recognized in:
- CONTRIBUTORS.md file
- Project README
- Release notes for major contributions

---

### License

By contributing, you agree your code will be licensed under the project's MIT License.

---

### Resources

- [Git Documentation](https://git-scm.com/doc)
- [GitHub Contributing Guide](https://docs.github.com/en/get-started)
- [Semantic Commit Messages](https://www.conventionalcommits.org/)
- [JavaScript Style Guide](https://airbnb.io/javascript/)
- [React Best Practices](https://react.dev/learn)

---

Thank you for contributing! 🎉

Your efforts help make this project better for everyone.

## Local Development vs Production Configuration

TrackTrail supports both configurations without changing source code before each test cycle.

### Local development

Use a separate `server/.env.local` for local backend/worker configuration and a local PostgreSQL database. It takes precedence over `server/.env` when `NODE_ENV` is not `production` or `staging`.

```text
server/.env.local.example -> server/.env.local
client/.env.local.example -> client/.env.local
```

Run the local stack from VS Code:

```bash
cd server
npm run dev
npm run worker:dev

cd ../client
npm run dev
```

The web app uses `http://localhost:5000/api` locally by default. No GitHub push or deployment is required to test code changes.

### Production

Keep the existing deployed environment variables in the production platform. Production continues to use the deployed API/web origins and the existing deployment configuration. `server/.env.local` is ignored by Git and must never be committed.

### Safety rule

Local development should use a separate PostgreSQL database and Redis instance. Do not use the production `DATABASE_URL` from a local `.env` when testing migrations, deletes, seed operations, or worker jobs.
