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
  explanation: EngineJobMatchExplanation | null;
}

/**
 * The real shape written by server/services/matchingService.js's
 * scoreTfIdf() — the only scorer engineJobsRoutes.js ever reads
 * (`method: "tfidf"` is hardcoded into both of its queries), so every
 * match_scores row this app ever sees has exactly these four keys. Typed
 * from that source, not guessed — but since the column is still a
 * freeform `Json?` at the DB level, every field stays optional and every
 * call site checks with `Array.isArray`/typeof before rendering, in case
 * of older or hand-edited rows that don't conform.
 */
export interface EngineJobMatchExplanation {
  matched_skills?: string[];
  missing_skills?: string[];
  similarity?: number;
  skill_boost?: number;
}

export interface EngineJob {
  id: number; // BigInt on the backend, safely a plain number after lib/prisma.js's BigInt.prototype.toJSON patch
  company_id: number | null;
  title: string;
  normalized_title: string;
  description: string;
  location: string | null;
  remote_type: string | null;
  /**
   * A raw job_sources.id FK — engineJobsRoutes.js does not `include` the
   * job_sources relation, so there is no human-readable name on this
   * object. Resolve a display name via useSources() (GET /api/sources)
   * and match on this id — see hooks/use-sources.ts.
   */
  source_id: number | null;
  source_url: string;
  external_job_id: string | null;
  canonical_job_id: number | null;
  /**
   * In practice this is always "new" — nothing in the ingestion/scraping
   * pipeline (checked services/ingestionService.js and every
   * `prisma.jobs.update*` call site) ever transitions a job to any other
   * status, even though engineJobsRoutes.js's GET / does accept a real
   * `status` query param. A status filter UI would have exactly one
   * option that does anything, so none is built for this reason (see
   * Step 7 report) — kept here as-is rather than narrowed, since the
   * column itself has no enum/CHECK constraint and could carry other
   * values from data ingested outside this codebase.
   */
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
