import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { getCompanies, getCompanyDetail } from '@/services/companies';
import type { CompaniesListParams } from '@/types/companies';

/**
 * Infinite-scroll browse for the Companies screen, mirroring
 * useJobsInfinite (hooks/use-jobs.ts) — GET /api/companies already
 * supports page/pageSize server-side (companiesRoutes.js), so this uses
 * TanStack Query's infinite-query support rather than client-side
 * pagination.
 */
export function useCompaniesInfinite(params: Omit<CompaniesListParams, 'page'> = {}) {
  const { status } = useAuth();
  const pageSize = params.pageSize ?? 25;

  return useInfiniteQuery({
    queryKey: ['companies', 'infinite', { ...params, pageSize }],
    queryFn: ({ pageParam }) => getCompanies({ ...params, pageSize, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const loadedSoFar = lastPage.meta.page * lastPage.meta.pageSize;
      return loadedSoFar < lastPage.meta.total ? lastPage.meta.page + 1 : undefined;
    },
    enabled: status === 'authenticated',
  });
}

export function useCompanyDetail(id: number) {
  const { status } = useAuth();

  return useQuery({
    queryKey: ['companies', 'detail', id],
    queryFn: () => getCompanyDetail(id),
    enabled: status === 'authenticated' && Number.isFinite(id),
  });
}
