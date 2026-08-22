const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

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

// Fail fast if Postgres isn't reachable, instead of discovering it on
// the first request.
prisma.$connect()
  .then(() => console.log("Postgres connected"))
  .then(() => seedJobSources())
  .then(() => console.log("job_sources seeded (manual/linkedin/indeed/gmail/extension)"))
  .catch((err) => console.error("Postgres connection error", err));

const app = express();

// Only allow the configured frontend origin(s) to call the API.
// CLIENT_URL can be a single URL or a comma-separated list.
const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (e.g. curl/Postman) with no origin,
      // allow any origin if none are configured (local dev fallback),
      // and always allow the Chrome extension (its origin looks like
      // "chrome-extension://<random-id>", which can't be listed in
      // CLIENT_URL ahead of time).
      if (
        !origin ||
        allowedOrigins.length === 0 ||
        allowedOrigins.includes(origin) ||
        origin.startsWith("chrome-extension://")
      ) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.static("public"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/jobs", require("./routes/jobRoutes"));
app.use("/api/gmail", require("./routes/gmailRoutes"));

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
app.use("/api/scrape", require("./routes/scrapeRoutes")); // routes apply `auth` per-handler
app.use("/api/engine/jobs", auth, require("./routes/engineJobsRoutes"));
app.use("/api/applications", auth, require("./routes/applyRoutes"));
app.use("/api/analytics", auth, require("./routes/analyticsRoutes"));
app.use("/api/profile", auth, require("./routes/profileRoutes"));
app.use("/api/companies", auth, require("./routes/companiesRoutes"));
app.use("/api/sources", auth, require("./routes/sourcesRoutes"));

app.get("/", (req, res) => {
  res.send("Backend Running");
});

// Catch-all JSON error handler. Without this, any thrown/next(err) error
// (like the CORS rejection above, or anything else) falls through to
// Express's default handler, which renders an HTML page — and any JSON
// client (like the browser extension's `res.json()`) then crashes with
// "Unexpected token '<' ... is not valid JSON". Always answer in JSON.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Server error" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server Running on ${PORT}`);
});