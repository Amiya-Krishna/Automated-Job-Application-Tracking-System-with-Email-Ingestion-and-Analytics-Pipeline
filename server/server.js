const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const connectDB = require("./config/db");

connectDB();

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