/**
 * GET /api/engine/jobs -> { data: EngineJob[], meta: EngineJobsMeta }
 * GET /api/engine/jobs/:id -> { data: EngineJob }
 *
 * Matches server/routes/engineJobsRoutes.js and the `jobs`/`companies`/
 * `match_scores` models in schema.prisma exactly (verified by reading
 * both, not assumed).
 */

export interface EngineJobMatchScore {
  /**
   * match_scores.score is a Prisma Decimal (schema: `Decimal @db.Decimal(5,2)`).
   * Decimal fields serialize to a JSON STRING via Prisma's Decimal#toJSON()
   * (unlike the BigInt ids elsewhere in this app, which server/lib/prisma.js
   * explicitly patches to serialize as numbers — there is no equivalent
   * patch for Decimal). Typed as `string` here rather than guessed as
   * `number`; use utils/format.ts's toNumber() before doing math or
   * formatting a percentage with it.
   */
  score: string;
  explanation: unknown; // Json? column — shape not documented/used yet, not guessed
}

export interface EngineJob {
  id: number; // BigInt on the backend, safely a plain number after lib/prisma.js's BigInt.prototype.toJSON patch
  company_id: number | null;
  title: string;
  normalized_title: string;
  description: string;
  location: string | null;
  remote_type: string | null;
  source_id: number | null;
  source_url: string;
  external_job_id: string | null;
  canonical_job_id: number | null;
  status: string | null;
  posted_at: string | null;
  scraped_at: string | null;
  content_hash: string;
  companies: { name: string } | null;
  match_scores: EngineJobMatchScore[]; // 0 or 1 entries in practice (unique per job/profile/method), never assume exactly 1
}

export interface EngineJobsMeta {
  page: number;
  pageSize: number;
  total: number;
  hasProfile: boolean;
}

export interface EngineJobsListParams {
  status?: string;
  minScore?: number;
  page?: number;
  pageSize?: number;
}
