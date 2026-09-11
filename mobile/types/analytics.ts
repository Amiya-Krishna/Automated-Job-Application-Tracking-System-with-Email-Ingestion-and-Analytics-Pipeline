/**
 * GET /api/analytics and GET /api/analytics/metrics -> identical shape
 * (both call the same formatAnalyticsResponse() in
 * server/routes/analyticsRoutes.js — verified by reading that file).
 *
 * Percentage fields come from a raw SQL `numeric` column via
 * server/lib/prisma.js's $queryRawUnsafe-based query() helper, which has
 * no Decimal-to-number normalization (only BigInt is patched there) — so
 * these serialize as JSON STRINGS (e.g. "45.5"), not numbers. Typed
 * accordingly; use utils/format.ts's toNumber() before formatting.
 * Integer counts (`total_applications`, `responses`, `interviews`,
 * `offers`) ARE cast with `::int` in the SQL, so those come through as
 * real numbers.
 */
export interface AnalyticsSummary {
  totalApplications: number;
  responseRatePct: string | number | null;
  conversionRate: {
    appliedToInterviewPct: string | number | null;
    interviewToOfferPct: string | number | null;
    appliedToOfferPct: string | number | null;
  };
  /**
   * Always `null` today — server/services/analyticsService.js hardcodes
   * this (tracked_jobs has no per-stage timestamp to compute it from
   * honestly; see that file's own comment). Not a bug to work around,
   * just don't render a fabricated number here.
   */
  averageResponseTimeHours: number | null;
  counts: {
    responses: number;
    interviews: number;
    offers: number;
  };
}

export interface AnalyticsResponse {
  meta: {
    rangeDays: number;
    computedFrom: string[];
  };
  data: AnalyticsSummary;
}

/**
 * GET /api/analytics/funnel -> { data: FunnelData }
 *
 * These counts come from raw SQL `count(*)` (bigint at the Postgres
 * level), which DOES go through lib/prisma.js's BigInt.prototype.toJSON
 * patch — so unlike the percentages above, these are real JSON numbers.
 */
export interface FunnelData {
  scraped: number;
  matched: number;
  applied: number;
  interview: number;
  offer: number;
}

export interface FunnelResponse {
  data: FunnelData;
}
