import { useEffect, useState } from 'react';

import { getSavedJobs, saveJob, subscribeSavedJobs, unsaveJob } from '@/services/savedJobs';
import type { EngineJob } from '@/types/jobs';

/**
 * Loads once on mount and keeps its own in-memory copy in sync with every
 * save/unsave this hook instance performs. Multiple screens using this
 * hook simultaneously (e.g. a JobCard's bookmark button and the Saved
 * Jobs screen open at once) is not a case this app currently creates —
 * there is no shared cache/query layer for this local-only data, matching
 * how small the feature is.
 */
export function useSavedJobs() {
  const [jobs, setJobs] = useState<EngineJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribeSavedJobs((next) => {
      if (!cancelled) {
        setJobs(next);
        setIsLoading(false);
      }
    });

    getSavedJobs().then((data) => {
      if (!cancelled) {
        setJobs(data);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const isSaved = (jobId: number) => jobs.some((job) => job.id === jobId);

  const toggleSaved = async (job: EngineJob) => {
    // Publish from the storage service so every mounted Jobs/Saved Jobs card
    // updates immediately, not only after the next app restart.
    if (isSaved(job.id)) {
      await unsaveJob(job.id);
    } else {
      await saveJob(job);
    }
  };

  return { jobs, isLoading, isSaved, toggleSaved };
}
