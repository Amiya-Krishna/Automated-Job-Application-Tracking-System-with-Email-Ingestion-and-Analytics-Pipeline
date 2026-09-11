import { api } from '@/services/api';
import type { AnalyticsResponse, AnalyticsSummary, FunnelData, FunnelResponse } from '@/types/analytics';

/**
 * GET /api/analytics — used over the identical GET /api/analytics/metrics
 * (both call the same backend function; `/analytics` is the primary one
 * per its own comment in analyticsRoutes.js) and over the legacy
 * GET /api/analytics/summary, which the analysis in Step 1 confirmed the
 * current frontend never calls and which reads the genuinely
 * system-wide (not per-user) analytics_daily rollup — not appropriate
 * for a personal analytics screen.
 */
export async function getAnalyticsSummary(rangeDays = 30): Promise<AnalyticsSummary> {
  const { data } = await api.get<AnalyticsResponse>('/analytics', { params: { range: rangeDays } });
  return data.data;
}

export async function getFunnel(): Promise<FunnelData> {
  const { data } = await api.get<FunnelResponse>('/analytics/funnel');
  return data.data;
}
