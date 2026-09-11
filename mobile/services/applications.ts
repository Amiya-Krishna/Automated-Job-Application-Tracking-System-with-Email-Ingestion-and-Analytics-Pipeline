import { api } from '@/services/api';
import type { AppliedJob } from '@/types/applications';

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
