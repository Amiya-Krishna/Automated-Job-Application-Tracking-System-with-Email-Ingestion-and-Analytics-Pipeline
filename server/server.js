const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const { pool } = require("./db/pg");

// Fail fast if Postgres isn't reachable, instead of discovering it on
// the first request.
pool
  .query("SELECT 1")
  .then(() => console.log("Postgres connected"))
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
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/jobs", require("./routes/jobRoutes"));
app.use("/api/gmail", require("./routes/gmailRoutes"));

// --- Intelligent Job Application Engine ---
// Everything in this app is now Postgres-backed — the manual tracker
// (auth/jobs above) and the engine below share the same database.
// See db/schema.sql.
app.use("/api/ingest", require("./routes/ingestRoutes"));
app.use("/api/engine/jobs", require("./routes/engineJobsRoutes"));
app.use("/api/applications", require("./routes/applyRoutes"));
app.use("/api/analytics", require("./routes/analyticsRoutes"));
app.use("/api/profile", require("./routes/profileRoutes"));

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