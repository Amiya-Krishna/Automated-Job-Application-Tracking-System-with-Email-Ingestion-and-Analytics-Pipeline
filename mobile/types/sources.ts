/**
 * GET /api/sources -> { data: JobSource[] }
 *
 * Matches server/routes/sourcesRoutes.js exactly (verified by reading
 * it). Used here purely to resolve an EngineJob's `source_id` to a
 * human-readable name (e.g. "LinkedIn", "Indeed") — GET /api/engine/jobs
 * and GET /api/engine/jobs/:id never include the job_sources relation
 * themselves, so this is the only way to get that name without a
 * backend change (see types/jobs.ts's EngineJob.source_id comment).
 */
export interface JobSource {
  id: number;
  name: string;
  baseUrl: string | null;
  createdAt: string | null;
  engineJobCount: number;
  trackedJobCount: number;
  jobCount: number;
}

/**
 * GET /api/sources/:id -> { data: JobSourceDetail }
 *
 * Like companies' detail endpoint, this does NOT run through the list
 * endpoint's camelCase mapping — it spreads `prisma.job_sources.findUnique`
 * as-is (see server/routes/sourcesRoutes.js), so top-level fields are raw
 * snake_case, not JobSource's camelCase shape.
 *
 * Exactly one of `jobs` / `trackedJobs` is present, never both: for the
 * global scraper sources (linkedin/indeed/remotive — see
 * GLOBAL_ENGINE_SOURCES in sourcesRoutes.js) it's the shared engine
 * `jobs` catalog; for the per-user sources (manual/gmail/extension) it's
 * THIS user's own tracked_jobs instead — matching the same per-source
 * ownership split the list endpoint's jobCount already makes.
 */
export interface JobSourceDetailJob {
  id: number;
  title: string;
  status: string;
  location: string | null;
  posted_at: string | null;
  source_url: string;
  companies: { name: string } | null;
}

export interface JobSourceDetailTrackedJob {
  id: number;
  company: string;
  role: string;
  status: string | null;
  location: string | null;
  applicationDate: string;
  sourceUrl: string | null;
}

export interface JobSourceDetail {
  id: number;
  name: string;
  base_url: string | null;
  created_at: string | null;
  jobs?: JobSourceDetailJob[];
  trackedJobs?: JobSourceDetailTrackedJob[];
}
