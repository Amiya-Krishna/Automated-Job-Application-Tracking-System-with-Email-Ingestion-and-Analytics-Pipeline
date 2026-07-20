const { Worker } = require("bullmq");
const { connection } = require("../queue");
const { query } = require("../db/pg");
const { scoreTfIdf } = require("../services/matchingService");

const MATCH_THRESHOLD = 70;

const matchWorker = new Worker(
  "match",
  async (bullJob) => {
    const { jobId } = bullJob.data;

    const { rows: jobRows } = await query("SELECT * FROM jobs WHERE id = $1", [jobId]);
    const job = jobRows[0];
    if (!job) throw new Error(`Job ${jobId} not found`);

    const { rows: profileRows } = await query("SELECT * FROM user_profile ORDER BY id LIMIT 1");
    const profile = profileRows[0];
    if (!profile) throw new Error("No user_profile configured — create one first");

    // Small recent-corpus sample so TF-IDF's IDF reflects real term rarity.
    const { rows: corpusRows } = await query(
      "SELECT description FROM jobs WHERE id != $1 ORDER BY scraped_at DESC LIMIT 200",
      [jobId]
    );
    const corpus = corpusRows.map((r) => r.description);

    const result = scoreTfIdf(job, profile, corpus);

    await query(
      `INSERT INTO match_scores (job_id, profile_id, method, score, explanation)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (job_id, method) DO UPDATE
         SET score = $4, explanation = $5, scored_at = now()`,
      [jobId, profile.id, result.method, result.score, JSON.stringify(result.explanation)]
    );

    const newStatus = result.score >= MATCH_THRESHOLD ? "matched" : "scored";
    await query("UPDATE jobs SET status = $1 WHERE id = $2 AND status = 'new'", [newStatus, jobId]);

    return result;
  },
  { connection, concurrency: 4 }
);

matchWorker.on("failed", (job, err) => {
  console.error(`[matchWorker] job ${job?.id} failed:`, err.message);
});

module.exports = matchWorker;
