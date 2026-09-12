import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { getEngineJob, getEngineJobs } from '@/services/jobs';
import type { EngineJobsListParams } from '@/types/jobs';

export function useJobs(params: EngineJobsListParams = {}) {
  const { status } = useAuth();

  return useQuery({
    queryKey: ['jobs', params],
    queryFn: () => getEngineJobs(params),
    enabled: status === 'authenticated',
  });
}

/** GET /api/engine/jobs/:id, for the Job Detail screen. */
export function useJob(id: number) {
  const { status } = useAuth();

  return useQuery({
    queryKey: ['jobs', 'detail', id],
    queryFn: () => getEngineJob(id),
    enabled: status === 'authenticated' && Number.isFinite(id),
  });
}

/**
 * Paginated browse for the Jobs screen, built on the same getEngineJobs()
 * service function as useJobs() above (no duplicate fetching logic) —
 * GET /api/engine/jobs already supports page/pageSize server-side
 * (engineJobsRoutes.js), so this uses TanStack Query's infinite-query
 * support rather than inventing client-side pagination.
 */
export function useJobsInfinite(params: Omit<EngineJobsListParams, 'page'> = {}) {
  const { status } = useAuth();
  const pageSize = params.pageSize ?? 25;

  return useInfiniteQuery({
    queryKey: ['jobs', 'infinite', { ...params, pageSize }],
    queryFn: ({ pageParam }) => getEngineJobs({ ...params, pageSize, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const loadedSoFar = lastPage.meta.page * lastPage.meta.pageSize;
      return loadedSoFar < lastPage.meta.total ? lastPage.meta.page + 1 : undefined;
    },
    enabled: status === 'authenticated',
  });
}
