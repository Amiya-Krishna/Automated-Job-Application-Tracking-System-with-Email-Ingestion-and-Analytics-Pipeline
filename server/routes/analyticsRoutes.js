const router = require("express").Router();
const { query } = require("../db/pg");

// GET /api/analytics/summary?range=30d
router.get("/summary", async (req, res) => {
  try {
    const days = parseInt(req.query.range, 10) || 30;
    const { rows } = await query(
      `SELECT
          coalesce(sum(jobs_scraped), 0) AS jobs_scraped,
          coalesce(sum(jobs_matched), 0) AS jobs_matched,
          coalesce(sum(applications_sent), 0) AS applications_sent,
          coalesce(sum(responses), 0) AS responses,
          round(
            coalesce(sum(responses), 0)::numeric / NULLIF(sum(applications_sent), 0) * 100, 1
          ) AS response_rate_pct
       FROM analytics_daily
       WHERE day >= current_date - $1::int`,
      [days]
    );
    res.json({ data: rows[0], meta: { rangeDays: days } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/funnel -> scraped -> matched -> applied -> interview -> offer
router.get("/funnel", async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT
          count(*) FILTER (WHERE j.status != 'duplicate') AS scraped,
          count(*) FILTER (WHERE ms.score >= 70) AS matched,
          count(*) FILTER (WHERE a.status = 'applied') AS applied,
          count(*) FILTER (WHERE a.status = 'interview') AS interview,
          count(*) FILTER (WHERE a.status = 'offer') AS offer
       FROM jobs j
       LEFT JOIN match_scores ms ON ms.job_id = j.id AND ms.method = 'tfidf'
       LEFT JOIN applications a ON a.job_id = j.id`
    );
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
