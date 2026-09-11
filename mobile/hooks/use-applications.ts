import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { getAppliedJobs } from '@/services/applications';

export function useApplications() {
  const { status } = useAuth();

  return useQuery({
    queryKey: ['applications'],
    queryFn: getAppliedJobs,
    // Never fires while hydrating/unauthenticated — avoids the exact
    // "authenticated API requests during hydration" race Step 4 was
    // built to prevent, and avoids firing once more right as logout
    // clears the cache.
    enabled: status === 'authenticated',
  });
}
