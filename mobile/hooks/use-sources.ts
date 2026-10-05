import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { getSourceDetail, getSources } from '@/services/sources';

/**
 * The sources visible to this account (see server/routes/sourcesRoutes.js) change rarely, so this
 * is cached far longer than the jobs/applications queries rather than
 * refetched on every screen focus.
 */
export function useSources() {
  const { status, user } = useAuth();

  // Role-aware on the server: users get Manual / Gmail / Extension (their own data), admins get the
  // fetched sources. The cache key includes the account so one user's list is never reused for another.
  return useQuery({
    queryKey: ['sources', user?.id ?? null],
    queryFn: getSources,
    enabled: status === 'authenticated',
    staleTime: 1000 * 60 * 30,
  });
}

export function useSourceDetail(id: number) {
  const { status, user } = useAuth();

  return useQuery({
    queryKey: ['sources', 'detail', user?.id ?? null, id],
    queryFn: () => getSourceDetail(id),
    enabled: status === 'authenticated' && Number.isFinite(id),
  });
}
