const { Worker } = require("bullmq");
const { connection } = require("../queue");
const { query } = require("../lib/prisma");
const { scoreTfIdf } = require("../services/matchingService");

const MATCH_THRESHOLD = 70;

// SECURITY FIX (multi-user audit): this worker used to read "the"
// user_profile (`ORDER BY id LIMIT 1`) — a single global row every user
// shared — and write one match_scores row per job with no notion of
// whose profile it came from. Now that user_profile is per-user
// (user_profile.user_id, see schema.prisma) and match_scores is unique
// per (job_id, profile_id, method), this scores:
//   - just the submitting user's profile, when the job came from that
//     user's manual/extension/gmail bridge (ownerUserId is set), or
//   - every user's profile, when the job has no single owner (scrape/
//     discovery results are shared catalog data every user should see
//     matched against their own resume).
async function scoreJobForProfile(job, profile, corpus) {
  const result = scoreTfIdf(job, profile, corpus);

  await query(
    `INSERT INTO match_scores (job_id, profile_id, method, score, explanation)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (job_id, profile_id, method) DO UPDATE
       SET score = $4, explanation = $5, scored_at = now()`,
    [
      job.id,
      profile.id,
      result.method,
      result.score,
      JSON.stringify(result.explanation),
    ],
  );

  return result;
}

const matchWorker = new Worker(
  "match",
  async (bullJob) => {
    const { jobId, ownerUserId } = bullJob.data;

    const { rows: jobRows } = await query("SELECT * FROM jobs WHERE id = $1", [
      jobId,
    ]);
    const job = jobRows[0];
    if (!job) throw new Error(`Job ${jobId} not found`);

    const profiles = ownerUserId
      ? (
          await query("SELECT * FROM user_profile WHERE user_id = $1", [ownerUserId])
        ).rows
      : (await query("SELECT * FROM user_profile WHERE user_id IS NOT NULL")).rows;

    if (!profiles.length) {
      // Not an error — a user who hasn't filled in their profile yet just
      // doesn't get match scores until they do. Nothing to retry.
      console.info(
        `[matchWorker] job=${jobId} skipped: no profile${ownerUserId ? ` for user=${ownerUserId}` : "s exist yet"}`,
      );
      return { status: "skipped", reason: "no_profile", jobId };
    }

    // Small recent-corpus sample so TF-IDF's IDF reflects real term rarity.
    const { rows: corpusRows } = await query(
      "SELECT description FROM jobs WHERE id != $1 ORDER BY scraped_at DESC LIMIT 200",
      [jobId],
    );
    const corpus = corpusRows.map((r) => r.description);

    const results = [];
    for (const profile of profiles) {
      results.push(await scoreJobForProfile(job, profile, corpus));
    }

    // "matched"/"scored" status reflects the best score across everyone
    // scored so far — used by engineJobsRoutes as a coarse global filter;
    // per-user relevance is what Matched Jobs actually reads.
    const bestScore = Math.max(...results.map((r) => r.score));
    const newStatus = bestScore >= MATCH_THRESHOLD ? "matched" : "scored";
    await query(
      "UPDATE jobs SET status = $1 WHERE id = $2 AND status = 'new'",
      [newStatus, jobId],
    );

    return { status: "ok", jobId, scored: results.length };
  },
  { connection, concurrency: 4 },
);

matchWorker.on("failed", (job, err) => {
  console.error(`[matchWorker] job ${job?.id} failed:`, err.message);
});

module.exports = matchWorker;
