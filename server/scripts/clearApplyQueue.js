// One-off utility: wipes ONLY the "apply" BullMQ queue in Redis.
//
// Why this exists: BullMQ queues are Redis-backed and durable — a job's
// payload is fixed at the moment it's added and never changes, no matter
// how many times the server/worker process is restarted afterwards.
// Restarting Node does NOT clear anything in Redis. So any apply jobs
// that were queued while testing BEFORE the ownerUserId fix landed in
// routes/applyRoutes.js are still sitting in Redis with their old
// payload (`{ jobId }`, no ownerUserId), and BullMQ keeps retrying them
// (up to their `attempts: 3` with backoff) every time a worker becomes
// available — which is exactly why a freshly-restarted worker can still
// report "job 1/2/3 has no ownerUserId": those are leftover pre-fix
// jobs, not newly-queued ones, even though they surface as "fresh"
// activity from the worker's point of view.
//
// This script only touches the "apply" queue — ingest/match/analytics/
// scrape are untouched. It does NOT change any application code path;
// it just clears stale queue state so you can re-test cleanly.
//
// Usage (from the server/ directory, with your real .env in place):
//   node scripts/clearApplyQueue.js

require("../config/loadEnv").loadEnv();
const { applyQueue, connection } = require("../queue");

async function main() {
  console.log('Purging the "apply" queue (waiting, delayed, failed, active, completed)...');
  await applyQueue.obliterate({ force: true });
  console.log('Done. The "apply" queue is now empty.');
  console.log(
    "Next apply-engine job will only be created when you click Apply again — that job will carry the current ownerUserId-aware payload.",
  );
  await connection.quit();
}

main().catch((err) => {
  console.error("Failed to clear the apply queue:", err.message);
  process.exit(1);
});
