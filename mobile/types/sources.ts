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
