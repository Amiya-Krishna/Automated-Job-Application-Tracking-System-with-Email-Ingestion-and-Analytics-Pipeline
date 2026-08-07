const { Worker } = require("bullmq");
const { connection } = require("../queue");
const { query } = require("../db/pg");

const ROLLUP_SQL = `
  INSERT INTO analytics_daily (day, jobs_scraped, jobs_matched, applications_sent, responses, response_rate_pct, refreshed_at)
  SELECT
      date_trunc('day', j.scraped_at)::date AS day,
      count(*) FILTER (WHERE j.status != 'duplicate') AS jobs_scraped,
      count(*) FILTER (WHERE ms.score >= 70) AS jobs_matched,
      count(*) FILTER (WHERE a.status = 'applied') AS applications_sent,
      count(*) FILTER (WHERE a.status IN ('interview','offer')) AS responses,
      round(
          count(*) FILTER (WHERE a.status IN ('interview','offer'))::numeric
          / NULLIF(count(*) FILTER (WHERE a.status = 'applied'), 0) * 100, 1
      ) AS response_rate_pct,
      now()
  FROM jobs j
  LEFT JOIN match_scores ms ON ms.job_id = j.id AND ms.method = 'tfidf'
  LEFT JOIN applications a ON a.job_id = j.id
  GROUP BY 1
  ON CONFLICT (day) DO UPDATE SET
      jobs_scraped = EXCLUDED.jobs_scraped,
      jobs_matched = EXCLUDED.jobs_matched,
      applications_sent = EXCLUDED.applications_sent,
      responses = EXCLUDED.responses,
      response_rate_pct = EXCLUDED.response_rate_pct,
      refreshed_at = now();
`;

const analyticsWorker = new Worker(
  "analytics",
  async () => {
    await query(ROLLUP_SQL);
    return { refreshedAt: new Date().toISOString() };
  },
  { connection, concurrency: 1 }
);

analyticsWorker.on("failed", (job, err) => {
  console.error("[analyticsWorker] rollup failed:", err.message);
});

module.exports = analyticsWorker;
