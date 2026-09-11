/**
 * GET /api/profile -> { data: Profile | null }
 *
 * Matches the `user_profile` model in schema.prisma exactly (verified
 * by reading it, not assumed). `null` when the authenticated user has
 * no profile row yet (shouldn't normally happen post the Step-2
 * registration fix, but the endpoint explicitly allows for it, so the
 * Profile screen must too).
 */
export interface Profile {
  id: number;
  user_id: number | null;
  full_name: string | null;
  email: string | null;
  resume_text: string | null;
  skills: string[];
  /**
   * Prisma Decimal (`@db.Decimal(3,1)`) -> serializes as a JSON string
   * via Decimal#toJSON(), same caveat as match_scores.score
   * (types/jobs.ts) and the analytics percentages (types/analytics.ts).
   */
  experience_years: string | null;
  skill_weights: Record<string, unknown> | null; // internal shape not used by this screen, not guessed
  updated_at: string | null;
}
