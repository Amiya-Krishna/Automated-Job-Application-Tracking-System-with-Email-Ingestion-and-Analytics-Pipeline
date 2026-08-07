const { Worker } = require("bullmq");
const { chromium } = require("playwright");
const { connection } = require("../queue");
const { query } = require("..@prisma/client");
const { prepareApplication } = require("../services/applyEngine");

// A persistent, "warmed" context (real cookies/session) rather than a fresh
// headless context per run — cold headless sessions are the easiest bot
// signal. `userDataDir` persists login state across restarts.
let sharedContextPromise = null;
async function getSharedContext() {
  if (!sharedContextPromise) {
    sharedContextPromise = chromium.launchPersistentContext(
      process.env.PLAYWRIGHT_PROFILE_DIR || "./playwright-profile",
      { headless: process.env.PLAYWRIGHT_HEADLESS !== "false" },
    );
  }
  return sharedContextPromise;
}

const applyWorker = new Worker(
  "apply",
  async (bullJob) => {
    const { jobId } = bullJob.data;

    const { rows } = await query(
      "SELECT id, source_url FROM jobs WHERE id = $1",
      [jobId],
    );
    const job = rows[0];
    if (!job) throw new Error(`Job ${jobId} not found`);

    const { rows: profileRows } = await query(
      "SELECT * FROM user_profile ORDER BY id LIMIT 1",
    );
    const profile = profileRows[0];
    if (!profile) throw new Error("No user_profile configured");

    const context = await getSharedContext();
    const result = await prepareApplication(
      { id: job.id, sourceUrl: job.source_url },
      profile,
      context,
    );

    // Note: `result.page` (when status is pending_review/needs_captcha) is
    // intentionally left open for the dashboard's review/solve-captcha flow
    // rather than closed here — closing it would defeat the human-in-the-loop
    // step this whole engine exists for.
    return {
      status: result.status,
      filled: result.filled,
      skipped: result.skipped,
    };
  },
  {
    connection,
    concurrency: 2, // keep low — Playwright + per-domain rate limiting
    limiter: { max: 5, duration: 60_000 }, // global soft cap: 5 apply preps/min
  },
);

applyWorker.on("failed", (job, err) => {
  console.error(`[applyWorker] job ${job?.id} failed:`, err.message);
});

module.exports = applyWorker;
