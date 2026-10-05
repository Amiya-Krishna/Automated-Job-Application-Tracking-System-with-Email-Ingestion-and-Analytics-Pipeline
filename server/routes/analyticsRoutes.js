const router = require("express").Router();
const { getAnalyticsSummary } = require("../services/analyticsService");
const { query } = require("../lib/prisma");
const requireAdmin = require("../middleware/requireAdmin");

function formatAnalyticsResponse(data, rangeDays) {
  return {
    meta: {
      rangeDays,
      computedFrom: [
        "tracked_jobs.application_date",
        "tracked_jobs.status",
        "scoped to the authenticated user",
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

// GET /api/analytics -> one-shot summary computed directly from Postgres,
// scoped to the authenticated user (see analyticsService.js's header
// comment for the full multi-user-scoping root-cause explanation).
router.get("/", async (req, res) => {
  try {
    const rangeDays = parseInt(req.query.range, 10) || 30;
    const data = await getAnalyticsSummary(req.user.id, rangeDays);
    res.json(formatAnalyticsResponse(data, data.rangeDays));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/metrics", async (req, res) => {
  try {
    const rangeDays = parseInt(req.query.range, 10) || 30;
    const data = await getAnalyticsSummary(req.user.id, rangeDays);
    res.json(formatAnalyticsResponse(data, data.rangeDays));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Legacy snapshot for dashboards that still expect the precomputed rollup
// model. Not called by the current frontend (confirmed: no client code
// references /analytics/summary) and analytics_daily is itself a genuinely
// system-wide rollup table with no user dimension of its own (see
// analyticsWorker.js) — left as-is, out of scope for this fix.
// SYSTEM-WIDE rollup (all users' activity) -> admin only.
router.get("/summary", requireAdmin, async (req, res) => {
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
      [days],
    );
    res.json({ data: rows[0], meta: { rangeDays: days } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/funnel -> matched -> applied -> interview -> offer
//
// The funnel is per-user and starts at "matched". (An earlier "scraped" stage was a
// global, all-users catalog count, which is not a step in any one person's search and
// made the funnel read as if it were - it was removed from the API and every client.)
// - "matched" is scoped to jobs matched against THIS user's own profile
//   (match_scores.profile_id -> user_profile.user_id) with a score >= 70.
// - "applied" is every row in this user's own tracked_jobs - creating a TrackedJob
//   IS what "applying" means in this app, regardless of its current status.
// - "interview"/"offer" use the same current-status-only definition as the
//   Conversion section above (no guaranteed sequential progression to infer from).
router.get("/funnel", async (req, res) => {
  try {
    const { rows } = await query(
      `WITH matched AS (
          SELECT count(DISTINCT ms.job_id) AS matched
          FROM match_scores ms
          JOIN user_profile up ON up.id = ms.profile_id
          WHERE up.user_id = $1 AND ms.score >= 70
       ),
       tracked AS (
          SELECT
              count(*) AS applied,
              count(*) FILTER (WHERE status = 'Interview') AS interview,
              count(*) FILTER (WHERE status = 'Offer') AS offer
          FROM tracked_jobs
          WHERE user_id = $1
       )
       SELECT matched.matched, tracked.applied, tracked.interview, tracked.offer
       FROM matched, tracked`,
      [req.user.id],
    );
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
