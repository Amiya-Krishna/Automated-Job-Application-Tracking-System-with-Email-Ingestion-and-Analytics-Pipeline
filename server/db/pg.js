const { Pool } = require("pg");

// Single Postgres pool used by the whole app — auth/tracker (users,
// tracked_jobs) and the intelligent job-application engine (jobs,
// companies, applications, etc.) all share this connection, pointed
// at PG_CONNECTION_STRING (a hosted Postgres URL — no local install
// needed).
const pool = new Pool({
  connectionString: process.env.PG_CONNECTION_STRING,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => {
  console.error("Unexpected Postgres pool error", err);
});

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 200) {
    console.warn(`Slow query (${duration}ms): ${text}`);
  }
  return res;
}

module.exports = { pool, query };
