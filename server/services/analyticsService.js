const { query } = require("../db/pg");

const ANALYTICS_SQL = `
WITH submitted AS (
  SELECT
      a.id,
      a.job_id,
      a.status,
      a.applied_at,
      a.outcome_updated_at,
      CASE
        WHEN a.status IN ('interview', 'offer', 'rejected')
         AND a.applied_at IS NOT NULL
         AND a.outcome_updated_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (a.outcome_updated_at - a.applied_at)) / 3600.0
      END AS response_time_hours
  FROM applications a
  WHERE a.applied_at IS NOT NULL
),
metrics AS (
  SELECT
      count(*)::int AS total_applications,
      count(*) FILTER (WHERE status IN ('interview', 'offer', 'rejected'))::int AS responses,
      count(*) FILTER (WHERE status = 'interview')::int AS interviews,
      count(*) FILTER (WHERE status = 'offer')::int AS offers,
      round(
        count(*) FILTER (WHERE status IN ('interview', 'offer', 'rejected'))::numeric
        / NULLIF(count(*), 0) * 100,
        1
      ) AS response_rate_pct,
      round(
        count(*) FILTER (WHERE status = 'interview')::numeric
        / NULLIF(count(*), 0) * 100,
        1
      ) AS applied_to_interview_pct,
      round(
        count(*) FILTER (WHERE status = 'offer')::numeric
        / NULLIF(count(*) FILTER (WHERE status = 'interview'), 0) * 100,
        1
      ) AS interview_to_offer_pct,
      round(
        count(*) FILTER (WHERE status = 'offer')::numeric
        / NULLIF(count(*), 0) * 100,
        1
      ) AS applied_to_offer_pct,
      round(
        avg(response_time_hours)::numeric,
        1
      ) AS average_response_time_hours
  FROM submitted
)
SELECT
    total_applications,
    responses,
    interviews,
    offers,
    response_rate_pct,
    applied_to_interview_pct,
    interview_to_offer_pct,
    applied_to_offer_pct,
    average_response_time_hours
FROM metrics;
`;

const WINDOW_SQL = `
WITH submitted AS (
  SELECT
      a.status,
      a.applied_at,
      a.outcome_updated_at,
      date_trunc('day', a.applied_at)::date AS day,
      CASE
        WHEN a.status IN ('interview', 'offer', 'rejected')
         AND a.applied_at IS NOT NULL
         AND a.outcome_updated_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (a.outcome_updated_at - a.applied_at)) / 3600.0
      END AS response_time_hours
  FROM applications a
  WHERE a.applied_at IS NOT NULL
    AND a.applied_at >= current_date - $1::int
)
SELECT
    count(*)::int AS total_applications,
    count(*) FILTER (WHERE status IN ('interview', 'offer', 'rejected'))::int AS responses,
    count(*) FILTER (WHERE status = 'interview')::int AS interviews,
    count(*) FILTER (WHERE status = 'offer')::int AS offers,
    round(
      count(*) FILTER (WHERE status IN ('interview', 'offer', 'rejected'))::numeric
      / NULLIF(count(*), 0) * 100,
      1
    ) AS response_rate_pct,
    round(
      count(*) FILTER (WHERE status = 'interview')::numeric
      / NULLIF(count(*), 0) * 100,
      1
    ) AS applied_to_interview_pct,
    round(
      count(*) FILTER (WHERE status = 'offer')::numeric
      / NULLIF(count(*) FILTER (WHERE status = 'interview'), 0) * 100,
      1
    ) AS interview_to_offer_pct,
    round(
      count(*) FILTER (WHERE status = 'offer')::numeric
      / NULLIF(count(*), 0) * 100,
      1
    ) AS applied_to_offer_pct,
    round(avg(response_time_hours)::numeric, 1) AS average_response_time_hours
FROM submitted;
`;

async function getAnalyticsSummary(rangeDays = 30) {
  const normalizedRange =
    Number.isInteger(rangeDays) && rangeDays > 0 ? rangeDays : 30;
  const { rows } = await query(WINDOW_SQL, [normalizedRange]);
  const summary = rows[0] || {};

  return {
    rangeDays: normalizedRange,
    ...summary,
  };
}

async function getAnalyticsSnapshot() {
  const { rows } = await query(ANALYTICS_SQL);
  return rows[0] || {};
}

module.exports = {
  ANALYTICS_SQL,
  getAnalyticsSummary,
  getAnalyticsSnapshot,
  WINDOW_SQL,
};
