const express = require("express");
const cors = require("cors");
const { buildCorsOptions } = require("./middleware/corsOptions");
require("./config/loadEnv").loadEnv();

// jobs.id, applications.id, and applications.job_id are Postgres BigInt in
// prisma/schema.prisma. JSON.stringify (used by res.json()) throws on raw
// BigInt values, so any route returning those columns — e.g. GET
// /api/engine/jobs, GET /api/applications — would crash with
// "TypeError: Do not know how to serialize a BigInt" without this.
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const prisma = require('./lib/prisma');
const { seedJobSources } = require('./services/seedSources');
const auth = require('./middleware/authMiddleware');
const requireAdmin = require('./middleware/requireAdmin');

// Fail fast if Postgres isn't reachable, instead of discovering it on
// the first request.
prisma.$connect()
  .then(() => console.log("Postgres connected"))
  .then(() => require("./lib/schemaCheck").warnIfSessionsTableMissing())
  .then(() => require("./lib/schemaCheck").warnIfAccountStatusMissing())
  .then(() => seedJobSources())
  .then(() => require("./services/adminBootstrap").ensureAdmins())
  .then(() => console.log("job_sources seeded (manual/linkedin/indeed/gmail/extension)"))
  .catch((err) => console.error("Postgres connection error", err));

const app = express();

// Render/Vercel/most hosts terminate TLS at a proxy; without this req.ip (used
// by the rate limiters) would be the proxy's address for every client.
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Baseline security headers (no extra dependency).
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
  });
  if (process.env.NODE_ENV === "production") {
    res.set("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
});

// Production-safe errors: routes still do `res.status(500).json({ message:
// error.message })`, which can leak internals (SQL, stack fragments). In
// production every 5xx body is replaced with a generic message; only the
// method/path/status is logged (never the message: it can echo user data).
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 500 && body && typeof body === "object") {
        console.error(`[server-error] ${req.method} ${req.path} -> ${res.statusCode}`);
        body = { ...body, message: "Server error. Please try again." };
      }
      return json(body);
    };
    next();
  });
}

// Only allow the configured frontend origin(s) to call the API.
// CLIENT_URL can be a single URL or a comma-separated list.
const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  throw new Error("CLIENT_URL must list one or more HTTPS frontend origins in production.");
}

app.use(cors(buildCorsOptions({ allowedOrigins })));
app.use(express.json());
app.use(require("./routes/wellKnownRoutes"));
app.use(express.static("public"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/jobs", require("./routes/jobRoutes"));
app.use("/api/gmail", require("./routes/gmailRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes")); // routes apply `auth` per-handler

// --- Intelligent Job Application Engine ---
// Everything in this app is now Postgres-backed — the manual tracker
// (auth/jobs above) and the engine below share the same database.
//
// NOTE on auth/multi-user here: `jobs`, `companies`, `applications`, and
// `job_sources` are genuinely shared/global catalog data — every user
// legitimately sees the same job postings and sources, so no user_id was
// added to those (see the multi-user audit report for the reasoning).
// `user_profile` and `match_scores`, however, WERE private-data leaks —
// every user shared one profile and one set of match scores — and have
// been fixed to be per-user (user_profile.user_id, match_scores unique on
// job_id+profile_id+method; see prisma/schema.prisma and the
// engineJobsRoutes/profileRoutes/matchWorker changes). `applications`
// (the automated apply-engine's own record) remains unscoped to a user —
// it's a 1:1-with-job automation record, not evidently a per-user table —
// and is intentionally NOT surfaced by user in the unified Applied Jobs
// view; see appliedJobsService.js for how it's safely merged in only when
// tied to a job this specific user actually tracked.
app.use("/api/ingest", auth, require("./routes/ingestRoutes"));
// Job Discovery is ADMIN-ONLY: auth + requireAdmin at the mount, so no scrape route can
// be reached by a normal user even if a handler forgets a check.
app.use("/api/scrape", auth, requireAdmin, require("./routes/scrapeRoutes"));
// Admin Panel API (overview, users/roles, delete sources / companies / matched jobs).
app.use("/api/admin", auth, requireAdmin, require("./routes/adminRoutes"));
app.use("/api/engine/jobs", auth, require("./routes/engineJobsRoutes"));
app.use("/api/applications", auth, require("./routes/applyRoutes"));
app.use("/api/analytics", auth, require("./routes/analyticsRoutes"));
app.use("/api/profile", auth, require("./routes/profileRoutes"));
// AI resume tailoring: one central service used by web, mobile and the extension.
app.use("/api/resume", auth, require("./routes/resumeRoutes").createResumeRouter());
app.use("/api/companies", auth, require("./routes/companiesRoutes"));
// Sources: every signed-in account, role-aware INSIDE the router (users get Manual/Gmail/
// Extension with their own data only; admins get the fetched global sources only).
app.use("/api/sources", auth, require("./routes/sourcesRoutes"));

app.get("/", (req, res) => {
  res.send("Backend Running");
});

// Lightweight liveness check — deliberately does NOT touch the database
// or require auth, so it answers even if Postgres is unreachable (see the
// prisma.$connect() above, which only logs on failure and never stops the
// server). Callers (mobile app, uptime pings) can use this to tell "the
// Render service itself is up" apart from "the DB/a specific route is
// broken", instead of inferring server state from whether /api/auth/login
// happens to work.
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Catch-all JSON error handler. Without this, any thrown/next(err) error
// (like the CORS rejection above, or anything else) falls through to
// Express's default handler, which renders an HTML page — and any JSON
// client (like the browser extension's `res.json()`) then crashes with
// "Unexpected token '<' ... is not valid JSON". Always answer in JSON.
app.use((err, req, res, next) => {
  const status = err.status || 500;
  // Never stringify arbitrary errors here: provider errors can include request
  // metadata or credentials. Route and status are sufficient for triage.
  console.error(`[request-error] ${req.method} ${req.path} -> ${status}`);
  const safe = process.env.NODE_ENV === "production" && status >= 500;
  res.status(status).json({ message: safe ? "Server error. Please try again." : err.message || "Server error" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server Running on ${PORT}`);
  if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not set — authentication will fail.");
  }
  // In-process reminder scheduler (set REMINDERS_ENABLED=false to disable, e.g.
  // if you trigger POST /api/notifications/run-reminders from an external cron).
  require("./services/reminderService").startReminderScheduler();
  const purge = setInterval(() => {
    require("./lib/sessions").purgeExpiredSessions().catch((e) => console.error("session purge failed:", e.message));
  }, 24 * 60 * 60 * 1000);
  if (purge.unref) purge.unref();
});
