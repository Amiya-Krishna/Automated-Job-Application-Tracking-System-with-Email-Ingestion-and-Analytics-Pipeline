/**
 * Several backend fields (match_scores.score, profile.experience_years,
 * the analytics percentage fields) are Prisma Decimal columns that
 * serialize to JSON strings, not numbers — see the comments in
 * types/jobs.ts, types/analytics.ts, and types/profile.ts for exactly
 * why. This is the one place that normalizes them, instead of every
 * screen re-deriving the same `typeof x === 'string' ? parseFloat(x) : x`
 * check.
 */
export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Formats a 0-100 score/percentage-like value for display, or a dash if unavailable. */
export function formatPercent(value: string | number | null | undefined): string {
  const num = toNumber(value);
  return num === null ? '—' : `${Math.round(num)}%`;
}

/** Formats an ISO date string (date-only or full timestamp) as a short, locale-aware date. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
