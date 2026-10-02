# Deployment Guide

Complete guide to deploying the Job Application Tracker Portal to production.

> **Consolidated from:** `DEPLOYMENT.md` (Last Updated: July 20, 2026; Version: 2.0.0 (PostgreSQL)).
> **Platform-specific production configuration** lives with each client: web (`06`), mobile / EAS / store release (`07`), browser extension (`08`).

---

## Pre-Deployment Checklist

- [ ] All features tested locally
- [ ] No console errors
- [ ] Environment variables configured
- [ ] Database backups created
- [ ] SSL certificate obtained (if needed)
- [ ] Dependencies up to date
- [ ] Code reviewed
- [ ] Production .env ready
- [ ] Deployment account/credentials ready
- [ ] A reachable Redis instance provisioned, if you plan to deploy the worker process (Job Discovery, matching, apply engine, analytics rollup — see "Background Workers" below)

---

## Deployment Options

### Option 1: Heroku (Recommended for Beginners)

#### Prerequisites

- Heroku account (free tier available)
- Heroku CLI installed
- Git installed
- A hosted PostgreSQL database (Neon, Supabase, Render, etc.) — connection URL, no local install

#### Step 1: Prepare Application

```bash
# Create Procfile in root directory
echo "web: cd server && npm start" > Procfile

# Create .env for production
# (Don't commit, set via Heroku dashboard)
```

#### Step 2: Initialize Git Repository

```bash
git init
git add .
git commit -m "Initial commit for Heroku deployment"
```

#### Step 3: Create Heroku App

```bash
heroku login
heroku create your-app-name
```

#### Step 4: Set Environment Variables

```bash
heroku config:set DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
heroku config:set JWT_SECRET=your_secret_key
heroku config:set NODE_ENV=production
heroku config:set CLIENT_URL=https://Automated-Job-Application-Tracking-System-with-Email-Ingestion-and-Analytics-Pipeline-ao8n.vercel.app,http://localhost:5173
```

#### Step 5: Deploy

```bash
git push heroku main
```

Monitor deployment:

```bash
heroku logs --tail
```

#### Step 6: Database Setup

```bash
# If you have seed data
heroku run npm run seed
```

### Option 2: Vercel (For Frontend)

#### Deploy Frontend Only

1. Go to [Vercel](https://vercel.com)
2. Import GitHub repository
3. Set environment variables
4. Deploy

**Environment Variables:**

```
VITE_API_BASE_URL=https://job-application-tracker-portal-o1ls.onrender.com
```

(Must be `VITE_API_BASE_URL` — that's the exact name `client/src/api.js` reads via
`import.meta.env.VITE_API_BASE_URL`. If it's set under any other name, Vite won't
expose it to the client build and the app silently falls back to
`http://localhost:5000`.)

### Option 3: Railway (Full Stack)

#### Prerequisites

- Railway account
- GitHub repository

#### Step 1: Connect Repository

1. Go to [Railway](https://railway.app)
2. Create new project
3. Connect GitHub repository

#### Step 2: Configure Services

**Backend Service:**

- Start command: `npm install && npm start`
- Port: 5000

**Frontend Service:**

- Start command: `npm install && npm run build`
- Build output: `dist`

#### Step 3: Set Environment Variables

In Railway dashboard:

```
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
JWT_SECRET=your_secret_key
NODE_ENV=production
REDIS_URL=rediss://default:password@host:port
```

#### Step 4: Deploy

Railway auto-deploys on push to main branch.

### Option 4: DigitalOcean / AWS / Google Cloud

#### Prerequisites

- Cloud account
- Droplet/Instance created
- SSH access
- Domain name (optional)

#### Step 1: Connect to Server

```bash
ssh root@your_server_ip
```

#### Step 2: Install Dependencies

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js
curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt install -y nodejs

# Install Nginx (reverse proxy)
apt install -y nginx

# Install PM2 (process manager)
npm install -g pm2
```

#### Step 3: Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/job-tracker.git
cd "Job Application Tracker Portal"
npm install
cd client && npm run build && cd ..
```

#### Step 4: Configure Environment

```bash
nano .env
# Add production values
```

#### Step 5: Setup PM2

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: "job-tracker",
      script: "./server/server.js",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
      },
    },
  ],
};
```

Start with PM2:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### Step 6: Configure Nginx

Create `/etc/nginx/sites-available/job-tracker`:

```nginx
server {
    listen 80;
    server_name your_domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }

    location /api {
        proxy_pass http://localhost:5000/api;
    }
}
```

Enable site:

```bash
ln -s /etc/nginx/sites-available/job-tracker /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

#### Step 7: Setup SSL (Let's Encrypt)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your_domain.com
```

---

## Production Configuration

### Environment Variables for Production

```env
# Database (hosted PostgreSQL — Neon, Supabase, Render, etc.)
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Queue backend for the matching/apply/analytics engine
REDIS_URL=rediss://default:password@host:port

# Server
NODE_ENV=production
PORT=5000

# Security
JWT_SECRET=generate-a-long-random-string-minimum-32-characters
JWT_EXPIRE=7d

# Frontend
CLIENT_URL=https://Automated-Job-Application-Tracking-System-with-Email-Ingestion-and-Analytics-Pipeline-ao8n.vercel.app,http://localhost:5173

# CORS
CORS_ORIGIN=https://yourdomain.com
```

### Security Best Practices

1. **Environment Variables**
   - Use strong, random JWT_SECRET
   - Never commit .env
   - Rotate secrets periodically

2. **CORS Configuration**
   - Only allow your domain
   - Never use "\*" in production

3. **HTTPS/SSL**
   - Always use HTTPS
   - Get free certificate from Let's Encrypt
   - Enforce HTTPS only

4. **Database**
   - Use a managed hosted Postgres provider (Neon, Supabase, Render)
   - Use strong passwords / connection-string credentials
   - Regular backups (most providers automate this)
   - Restrict network access where the provider supports it

5. **Headers**

   ```javascript
   // Add to server.js
   const helmet = require("helmet");
   app.use(helmet());
   ```

6. **Rate Limiting**

   ```javascript
   const rateLimit = require("express-rate-limit");

   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000,
     max: 100,
   });

   app.use("/api/", limiter);
   ```

---

## Build Optimization

### Frontend

```bash
# Analyze bundle
npm run build -- --analyze

# Optimize images
# Use tools like ImageOptim or TinyPNG

# Code splitting
# Already handled by Vite
```

### Backend

```bash
# Use compression
npm install compression

# In server.js:
const compression = require('compression');
app.use(compression());
```

---

## Database Setup for Production

### Hosted PostgreSQL (Neon / Supabase / Render)

1. **Create a production-tier database**
   - Free tiers are fine for development; move to a paid tier for production
     traffic (more connections, no auto-pausing, better backup retention)
   - Select a region close to your app server

2. **Credentials**
   - Use the connection string your provider issues; rotate it if it's ever exposed
   - Most providers manage the underlying database user for you

3. **Network Access**
   - Most hosted providers accept connections from anywhere over SSL by
     default (that's what `?sslmode=require` in the connection string is for)
   - Some let you restrict by IP allowlist — use it if your app server has a
     static IP

4. **Backups**
   - Enable automatic backups (Neon/Supabase/Render all offer this)
   - Periodically test restoring from a backup

5. **Monitoring**
   - Use your provider's built-in query/connection dashboard
   - `server/lib/prisma.js` configures Prisma's own `log: ["warn", "error"]` (dev) / `["error"]` (prod) — there is no custom slow-query (e.g. 200ms threshold) logger in this codebase; rely on your Postgres provider's dashboard for query timing

---

## Background Workers (Redis + BullMQ)

The API process (`npm start` / `server.js`) and the worker process
(`npm run worker` / `worker.js`) are separate Node processes. The API alone
is enough for the manual tracker (auth, add/edit/delete jobs). The worker
process is what actually runs Job Discovery, matching, the apply engine, and
the analytics rollup — deploy both if you want those features working.

1. **Redis**
   - Any reachable Redis instance works (self-hosted, or a managed provider like Upstash)
   - Set `REDIS_URL` for both the API and worker process's environment — `queue/index.js` falls back to `redis://127.0.0.1:6379` if unset, which is almost never correct in a hosted deployment
   - Enable AOF persistence if you don't want queued-but-not-yet-processed jobs to disappear on a Redis restart

2. **Deploying the worker**
   - Same codebase as the API (`server/`), different start command: `npm run worker` instead of `npm start`
   - Deploy it as its own process/service (e.g. a second Render "Background Worker" service, a separate Railway service, or a second PM2 process) — not as a second copy of the web server
   - It needs the same `DATABASE_URL` as the API, plus `REDIS_URL`

3. **Job Discovery provider availability**
   - Remotive needs no credentials; the worker only needs outbound access to `remotive.com`
   - LinkedIn and Indeed use Playwright browser discovery. The worker host must have the Playwright Chromium runtime installed (`npx playwright install chromium`) and enough CPU/memory for browser sessions. These sources may fail or be blocked when the provider presents CAPTCHA/authentication/rate-limit challenges or changes its markup; the system reports those conditions instead of bypassing them

---

## Monitoring & Logging

### Application Monitoring

```bash
# Install New Relic
npm install newrelic

# Monitor uptime
# Use UptimeRobot (free)
# Configure health checks
```

### Error Tracking

```bash
# Install Sentry
npm install @sentry/node

# In server.js:
const Sentry = require("@sentry/node");
Sentry.init({ dsn: "your_dsn" });
app.use(Sentry.Handlers.errorHandler());
```

### Logs

```bash
# PM2 logs
pm2 logs

# View specific app logs
pm2 logs job-tracker

# Save logs to file
pm2 logs job-tracker > logs/app.log
```

---

## Performance Optimization

### Caching

```javascript
// Cache static assets
app.use(
  express.static("public", {
    maxAge: "1d",
  }),
);

// Redis caching (advanced)
const redis = require("redis");
const client = redis.createClient();
```

### Database Indexing

This project uses Prisma migrations, not a hand-written `db/schema.sql` (that
file doesn't exist in the current version of this project). Indexes are
defined directly in `server/prisma/schema.prisma` and applied via
`npx prisma migrate deploy`. Illustrative example of the kind of index already in place:

```javascript
// server/prisma/schema.prisma
CREATE INDEX IF NOT EXISTS idx_tracked_jobs_user_id ON tracked_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_tracked_jobs_status ON tracked_jobs(status);
```

### Load Testing

```bash
# Install Apache Bench
# ab -n 1000 -c 100 http://your-app.com/

# Or use artillery
npm install -g artillery
artillery quick --count 300 --num 10 http://your-app.com
```

---

## Continuous Deployment (CD)

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Deploy to Heroku
        run: |
          git push https://heroku:${{ secrets.HEROKU_API_KEY }}@git.heroku.com/${{ secrets.HEROKU_APP_NAME }}.git main
```

---

## Post-Deployment

### Testing

- [ ] Test all features on production
- [ ] Verify SSL certificate
- [ ] Check CORS configuration
- [ ] Test API endpoints
- [ ] Verify database connectivity
- [ ] Test file uploads (if applicable)
- [ ] Check email notifications (if applicable)

### Monitoring

- [ ] Monitor error logs
- [ ] Watch performance metrics
- [ ] Monitor database usage
- [ ] Check storage space
- [ ] Verify backups

### Maintenance

- [ ] Schedule regular backups
- [ ] Update dependencies monthly
- [ ] Monitor security advisories
- [ ] Review logs weekly
- [ ] Test disaster recovery

---

## Rollback Procedure

### If Deployment Fails

```bash
# Heroku rollback
heroku releases
heroku rollback v10

# Manual rollback
git log --oneline
git revert <commit-hash>
git push main

# PM2 rollback
cd /home/user/app
git checkout previous-version
npm install
pm2 restart job-tracker
```

---

## Cost Optimization

- Use free tier services during development
- Scale resources as needed
- Use CDN for static files (Cloudflare free)
- Monitor database usage
- Clean up unused resources

---

## Troubleshooting Deployment

### Gmail OAuth (Web, Extension, Mobile)

One Google redirect URI serves all three clients: `GOOGLE_REDIRECT_URI` =
`https://<api-host>/api/gmail/callback` (must also be listed in the Google Cloud OAuth client's
"Authorized redirect URIs"). The server returns each client to where it started using the signed
`state` created by `GET /api/gmail/auth-url`; the callback never creates, rotates or revokes a login session.

| Client | Starts with | Returns to |
|---|---|---|
| Web | `/gmail/auth-url?returnTo=<current path>` (`Origin` header identifies the site) | that origin (must be in `CLIENT_URL`) + that path, `?gmail=connected` |
| Extension | `GMAIL_CONNECT` message -> `/gmail/auth-url?source=extension` | `https://<api-host>/extension/gmail-success.html?gmail=...`; the service worker closes the Google tab and refocuses the original dashboard tab |
| Mobile | `/gmail/auth-url?source=mobile&redirectUri=<Linking.createURL('gmail-callback')>` | exactly that deep link (`tracktrail://gmail-callback`, legacy `mobile://gmail-callback`; Expo Go `exp://<LAN ip>/--/gmail-callback` only outside production) |

Environment: `CLIENT_URL` must list **every** web origin users sign in on (comma-separated). `EXTENSION_REDIRECT_URL`
should be **unset** (or an https page); a `chrome-extension://` value is ignored because Chrome blocks that redirect.
`SERVER_URL` is optional (derived from `GOOGLE_REDIRECT_URI`).

Testing: development - Google Cloud client with redirect URI `http://localhost:5000/api/gmail/callback`,
`GOOGLE_REDIRECT_URI` set to the same, `CLIENT_URL` including `http://localhost:5173`; sign in, open Integrations (web) /
Email tab (extension, with API base set to `http://localhost:5000/api`) / Profile -> Gmail (mobile) and connect.
Production - same with the Render/Vercel URLs, the extension's default API base, and a standalone mobile build.

Extension caveat: the service worker can only see the landing page when the API host is in `manifest.json` `host_permissions` (the production host is). With a custom/local API base the Google tab is not closed automatically (close it yourself); the dashboard still re-checks Gmail status as soon as you return to it.

### Issue: Login returns "TrackTrail is having trouble right now" (HTTP 500)

Extension, mobile and web logins all create a row in `user_sessions` via
`sessions.issueSession()`. A 500 from `POST /api/auth/login` after the
credentials were accepted almost always means the production database or the
generated Prisma client is behind the code:

- `[auth/login] failed: P2021` in the server log: table `user_sessions` is
  missing. Run `npx prisma migrate deploy` against the production
  `DATABASE_URL` (migration `20260929000000_mobile_sessions_push`).
- `[auth/login] failed: TypeError`: the Prisma client was generated from an
  older schema. Run `npx prisma generate` in the build step.
- On boot the server logs a `[schema-check]` line saying which of the two is wrong.

Production build/release steps (never `prisma migrate dev` in production):

```bash
# build step
cd server && npm ci && npx prisma generate
# release / pre-deploy step (runs once per deploy, before the new instance starts)
npx prisma migrate deploy
# start
npm start
```

`npm run build` = `prisma generate`, `npm run release` = `prisma migrate deploy`.
`npm run prisma:migrate` (`migrate dev`) now refuses to run with `NODE_ENV=production`.

### Issue: Postgres Connection Failed

```bash
# Check DATABASE_URL is the exact URL from your provider
# Verify ?sslmode=require is present if your provider needs it
# Check the database isn't paused (common on free tiers)
# Verify IP allowlist / firewall rules if your provider restricts access
```

### Issue: CORS Errors in Production

```bash
# Verify CLIENT_URL in .env
# Check Nginx headers
# Clear browser cache
```

### Issue: High Response Times

```bash
# Check database indexes
# Enable compression
# Use CDN
# Optimize queries
# Add caching layer
```

### Issue: Out of Memory

```bash
# Check PM2 memory usage
pm2 monit

# Increase server memory
# Optimize code
# Clear caches
```

---

## Useful Commands

```bash
# SSH into server
ssh user@your-server-ip

# Check disk space
df -h

# Check memory
free -h

# View running processes
ps aux | grep node

# Kill process
kill -9 <PID>

# Restart service
systemctl restart service-name

# View logs
journalctl -u service-name -f

# Git status
git status
git log

# PM2 commands
pm2 list
pm2 logs
pm2 restart all
pm2 stop app-name
pm2 delete app-name
```

---

## Checklist for Production

- [ ] Environment variables configured
- [ ] Hosted PostgreSQL database provisioned and schema migrated (`npx prisma migrate deploy` — not `npm run db:migrate`, which is dead code from an earlier pre-Prisma version of this project)
- [ ] SSL/HTTPS enabled
- [ ] CORS properly configured
- [ ] Security headers in place
- [ ] Rate limiting enabled
- [ ] Error tracking setup (Sentry)
- [ ] Monitoring setup (New Relic)
- [ ] Backups automated
- [ ] Deployment tested
- [ ] Rollback procedure documented
- [ ] Team trained on deployment

---

## Resources

- [Heroku Deployment](https://devcenter.heroku.com)
- [Neon Docs](https://neon.tech/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Nginx Docs](https://nginx.org/en/docs/)
- [PM2 Docs](https://pm2.keymetrics.io)
- [SSL Certificates - Let's Encrypt](https://letsencrypt.org)
- [Security Best Practices](https://owasp.org)

---

**Next Steps**: Monitor your deployment regularly and keep dependencies updated!
