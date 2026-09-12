import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { getSources } from '@/services/sources';

/**
 * The job_sources table (LinkedIn, Indeed, Manual, Gmail, Extension —
 * see server/services/seedSources.js) changes essentially never, so this
 * is cached far longer than the jobs/applications queries rather than
 * refetched on every screen focus.
 */
export function useSources() {
  const { status } = useAuth();

  return useQuery({
    queryKey: ['sources'],
    queryFn: getSources,
    enabled: status === 'authenticated',
    staleTime: 1000 * 60 * 30,
  });
}

/** `EngineJob.source_id` -> display name, for JobCard/Job Detail. */
export function useSourceNameById(): Map<number, string> {
  const { data } = useSources();

  return useMemo(() => {
    const map = new Map<number, string>();
    data?.forEach((source) => map.set(source.id, source.name));
    return map;
  }, [data]);
}
