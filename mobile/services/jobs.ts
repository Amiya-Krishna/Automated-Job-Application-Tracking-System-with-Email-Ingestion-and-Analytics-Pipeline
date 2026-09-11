import { api } from '@/services/api';
import type { EngineJob, EngineJobsListParams, EngineJobsMeta } from '@/types/jobs';

export interface EngineJobsPage {
  jobs: EngineJob[];
  meta: EngineJobsMeta;
}

/** GET /api/engine/jobs — the discovered/matched job catalog, paginated server-side. */
export async function getEngineJobs(params: EngineJobsListParams = {}): Promise<EngineJobsPage> {
  const { data } = await api.get<{ data: EngineJob[]; meta: EngineJobsMeta }>('/engine/jobs', {
    params,
  });
  return { jobs: data.data, meta: data.meta };
}

/** GET /api/engine/jobs/:id — a single job with this user's match score attached. */
export async function getEngineJob(id: number): Promise<EngineJob> {
  const { data } = await api.get<{ data: EngineJob }>(`/engine/jobs/${id}`);
  return data.data;
}
