const router = require("express").Router();
const { getAnalyticsSummary } = require("../services/analyticsService");

function formatAnalyticsResponse(data, rangeDays) {
  return {
    meta: {
      rangeDays,
      computedFrom: [
        "applications.applied_at",
        "applications.outcome_updated_at",
        "applications.status",
      ],
    },
    data: {
      totalApplications: data.total_applications,
      responseRatePct: data.response_rate_pct,
      conversionRate: {
        appliedToInterviewPct: data.applied_to_interview_pct,
        interviewToOfferPct: data.interview_to_offer_pct,
        appliedToOfferPct: data.applied_to_offer_pct,
      },
      averageResponseTimeHours: data.average_response_time_hours,
      counts: {
        responses: data.responses,
        interviews: data.interviews,
        offers: data.offers,
      },
    },
  };
}

// GET /api/analytics -> one-shot summary computed directly from Postgres.
router.get("/", async (req, res) => {
  try {
    const rangeDays = parseInt(req.query.range, 10) || 30;
    const data = await getAnalyticsSummary(rangeDays);
    res.json(formatAnalyticsResponse(data, data.rangeDays));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/metrics", async (req, res) => {
  try {
    const rangeDays = parseInt(req.query.range, 10) || 30;
    const data = await getAnalyticsSummary(rangeDays);
    res.json(formatAnalyticsResponse(data, data.rangeDays));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Legacy snapshot for dashboards that still expect the precomputed rollup model.
router.get("/summary", async (req, res) => {
  try {
    const days = parseInt(req.query.range, 10) || 30;
    const { rows } = await require("../db/pg").query(
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
      [days],
    );
    res.json({ data: rows[0], meta: { rangeDays: days } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/funnel -> scraped -> matched -> applied -> interview -> offer
router.get("/funnel", async (req, res) => {
  try {
    const { rows } = await require("../db/pg").query(
      `SELECT
          count(*) FILTER (WHERE j.status != 'duplicate') AS scraped,
          count(*) FILTER (WHERE ms.score >= 70) AS matched,
          count(*) FILTER (WHERE a.status = 'applied') AS applied,
          count(*) FILTER (WHERE a.status = 'interview') AS interview,
          count(*) FILTER (WHERE a.status = 'offer') AS offer
       FROM jobs j
       LEFT JOIN match_scores ms ON ms.job_id = j.id AND ms.method = 'tfidf'
       LEFT JOIN applications a ON a.job_id = j.id`,
    );
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
