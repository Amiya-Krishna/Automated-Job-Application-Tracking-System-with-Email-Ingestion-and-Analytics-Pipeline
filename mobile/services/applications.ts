import { api } from '@/services/api';
import type {
  AppliedJob,
  CreateApplicationInput,
  EngineApplication,
  OutcomeStatus,
  TrackedJobRecord,
  UpdateApplicationInput,
} from '@/types/applications';

/**
 * GET /api/jobs/applied — the unified applied-jobs view (manual +
 * extension + Gmail + engine status folded in). Chosen over the
 * lower-level GET /api/applications (server/routes/applyRoutes.js),
 * which only covers jobs that entered the automated apply-engine
 * pipeline specifically — a strict subset, and the wrong data source
 * for a general "my applications" screen. See types/applications.ts.
 */
export async function getAppliedJobs(): Promise<AppliedJob[]> {
  const { data } = await api.get<{ data: AppliedJob[] }>('/jobs/applied');
  return data.data;
}

/**
 * POST /api/jobs — manual "Add Application" entry point.
 *
 * This is deliberately NOT `POST /api/applications/:jobId`: that route
 * (see applyEngineJob below) applies to a job already discovered by the
 * automated engine and requires a numeric engine job id it queues
 * automation for. Adding an application by hand has no engine job to
 * point at, and jobRoutes.js's POST / is exactly the endpoint the web
 * app's manual "Add Job" form and the browser extension already use for
 * this (see client/src/pages/AppliedJobs.jsx).
 */
export async function createTrackedJob(input: CreateApplicationInput): Promise<TrackedJobRecord> {
  const { data } = await api.post<TrackedJobRecord>('/jobs', input);
  return data;
}

/**
 * PUT /api/jobs/:id — the real update endpoint for a manually/extension/
 * Gmail-tracked application. Returns only `{ message }` (jobRoutes.js),
 * not the updated row, so callers must invalidate `['applications']`
 * afterwards rather than read the response for fresh data.
 */
export async function updateTrackedJob(
  trackedJobId: number,
  input: UpdateApplicationInput,
): Promise<void> {
  await api.put(`/jobs/${trackedJobId}`, input);
}

/**
 * GET /api/applications — the apply-engine's own record, already scoped
 * server-side to jobs this user has tracked (see applyRoutes.js's
 * ownsApplicationJob/GET "/" — SECURITY FIX comment, verified by reading
 * the route). `status` is a real, backend-supported query filter
 * (`?status=pending`, etc.) — used both to resolve the numeric
 * `applications.id` a given engine job maps to (hooks/use-applications.ts's
 * useEngineApplicationForJob) and by the standalone Engine Applications
 * screen's status filter chips (useEngineApplications).
 */
export async function getEngineApplications(status?: string): Promise<EngineApplication[]> {
  const { data } = await api.get<{ data: EngineApplication[] }>('/applications', {
    params: status ? { status } : undefined,
  });
  return data.data;
}

/** POST /api/applications/:jobId — apply to (queue) a matched Engine Job. `jobId` is the `jobs.id`, not a TrackedJob id. */
export async function applyToEngineJob(
  jobId: number,
): Promise<{ status: string; jobId: number; trackedJobId: number | null }> {
  const { data } = await api.post(`/applications/${jobId}`);
  return data;
}

/** POST /api/applications/:id/submit — `id` is the `applications.id` (from getEngineApplications), not a job id or TrackedJob id. */
export async function submitEngineApplication(
  applicationId: number,
): Promise<{ status: string; jobId: number }> {
  const { data } = await api.post(`/applications/${applicationId}/submit`);
  return data;
}

/** POST /api/applications/:id/outcome — `id` is the `applications.id`. `status` must be one of OUTCOME_STATUSES (400 otherwise). */
export async function recordEngineOutcome(
  applicationId: number,
  status: OutcomeStatus,
): Promise<{ status: string }> {
  const { data } = await api.post(`/applications/${applicationId}/outcome`, { status });
  return data;
}
