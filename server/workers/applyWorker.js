const { Worker } = require("bullmq");
const { chromium } = require("playwright");
const { connection } = require("../queue");
const { query } = require("../lib/prisma");
const { prepareApplication, setStatus } = require("../services/applyEngine");

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
    // SECURITY FIX (multi-user audit): this used to run
    // `SELECT * FROM user_profile ORDER BY id LIMIT 1` — the same
    // "single global row every user shared" bug matchWorker.js's own
    // header comment already documented fixing there. In practice this
    // meant every apply-engine job, for every user, filled out
    // application forms using whichever profile happened to have the
    // lowest id — one user's name/email/resume could silently be used
    // to apply on another user's behalf. Now scoped to the user who
    // actually queued this apply (`ownerUserId`, set by
    // routes/applyRoutes.js's POST /:jobId when it enqueues this job —
    // the same convention ingestionService.js/matchWorker.js already use
    // for matchQueue).
    const { jobId, ownerUserId } = bullJob.data;

    // DIAGNOSTIC (not a behavior change): prints exactly what this
    // worker received for this job — compare against the
    // "[applyRoutes] enqueued apply job" line for the same jobId to see
    // whether the payload changed in transit or was simply never set by
    // the producer that created it. Safe to delete once the mismatch is
    // confirmed.
    console.log("[applyWorker] received job", bullJob.id, "data:", bullJob.data);

    const { rows } = await query(
      "SELECT id, source_url FROM jobs WHERE id = $1",
      [jobId],
    );
    const job = rows[0];
    if (!job) throw new Error(`Job ${jobId} not found`);

    if (!ownerUserId) {
      throw new Error(
        `Apply job for jobId=${jobId} has no ownerUserId — refusing to guess whose profile to use`,
      );
    }

    const { rows: profileRows } = await query(
      "SELECT * FROM user_profile WHERE user_id = $1",
      [ownerUserId],
    );
    const profile = profileRows[0];
    if (!profile) {
      // Legitimate business-state failure, not a code bug (Step 18/final
      // stabilization audit) — but it used to only ever reach a server
      // console log via BullMQ's own `failed` handler below, with no
      // trace in the `applications` row this job is for. The user had
      // no way to discover *why* an automated application never
      // progressed short of reading server logs they don't have access
      // to. Recording it the same way prepareApplication's own failures
      // are (setStatus, applyEngine.js) means it now shows up as a
      // normal "failed" application with a clear, actionable reason in
      // both the Applications tab and the Engine Applications queue.
      const reason = `No profile configured for user ${ownerUserId} — add a profile before running automated applications.`;
      await setStatus(jobId, "failed", { reason });
      throw new Error(reason);
    }

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
