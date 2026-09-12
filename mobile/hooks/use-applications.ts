import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useAuth } from '@/hooks/use-auth';
import {
  applyToEngineJob,
  createTrackedJob,
  getAppliedJobs,
  getEngineApplications,
  recordEngineOutcome,
  submitEngineApplication,
  updateTrackedJob,
} from '@/services/applications';
import type { CreateApplicationInput, OutcomeStatus, UpdateApplicationInput } from '@/types/applications';

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

/**
 * A single application's detail, derived from the already-fetched
 * `['applications']` list rather than a dedicated backend call — there
 * is no `GET /api/jobs/:id` (verified by reading jobRoutes.js: only
 * `GET /`, `GET /applied`, `PUT /:id`, `DELETE /:id` exist), so a
 * detail screen reads from the same cache the list screen already
 * populated. Returns `undefined` while the list is still loading, and
 * `null` once loaded if no matching application exists.
 */
export function useApplication(trackedJobId: number) {
  const { data, isLoading, isError, error, refetch, isRefetching } = useApplications();

  const application = useMemo(() => {
    if (!data) return undefined;
    return data.find((item) => item.trackedJobId === trackedJobId) ?? null;
  }, [data, trackedJobId]);

  return { application, isLoading, isError, error, refetch, isRefetching };
}

/**
 * Full engine-applications list, cached under one shared query key
 * regardless of which job a screen asks about — so viewing several
 * application details in a row costs one fetch, not one per screen (see
 * the Step 6 plan's performance note). `select` narrows to the single
 * row a given engine job maps to; only enabled when there's actually an
 * `engineJobId` to look up.
 */
export function useEngineApplicationForJob(engineJobId: number | null) {
  const { status } = useAuth();

  return useQuery({
    queryKey: ['applications', 'engine'],
    queryFn: getEngineApplications,
    enabled: status === 'authenticated' && engineJobId !== null,
    select: (data) => data.find((item) => item.job_id === engineJobId) ?? null,
  });
}

/**
 * Invalidates every query whose displayed numbers could change after an
 * application is created/edited/submitted/updated, and returns the
 * combined promise. TanStack Query awaits whatever `onSuccess` returns
 * before resolving the mutation's own `mutate`/`mutateAsync` promise, so
 * returning (not just firing) this from each mutation's `onSuccess`
 * below means a caller that `await`s `mutateAsync` and then navigates to
 * a screen reading `['applications']` (e.g. Add → detail) sees the
 * refreshed list, not a stale cache mid-refetch.
 */
function invalidateApplicationEffects(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['applications'] }),
    // Prefix match (default `exact: false`) covers both
    // ['analytics','summary', rangeDays] and ['analytics','funnel'].
    queryClient.invalidateQueries({ queryKey: ['analytics'] }),
  ]);
}

export function useCreateApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateApplicationInput) => createTrackedJob(input),
    onSuccess: () => invalidateApplicationEffects(queryClient),
  });
}

export function useUpdateApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ trackedJobId, input }: { trackedJobId: number; input: UpdateApplicationInput }) =>
      updateTrackedJob(trackedJobId, input),
    onSuccess: () => invalidateApplicationEffects(queryClient),
  });
}

export function useApplyToEngineJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: number) => applyToEngineJob(jobId),
    onSuccess: () => invalidateApplicationEffects(queryClient),
  });
}

export function useSubmitEngineApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (applicationId: number) => submitEngineApplication(applicationId),
    onSuccess: () =>
      Promise.all([
        invalidateApplicationEffects(queryClient),
        queryClient.invalidateQueries({ queryKey: ['applications', 'engine'] }),
      ]),
  });
}

export function useRecordEngineOutcome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ applicationId, status }: { applicationId: number; status: OutcomeStatus }) =>
      recordEngineOutcome(applicationId, status),
    onSuccess: () =>
      Promise.all([
        invalidateApplicationEffects(queryClient),
        queryClient.invalidateQueries({ queryKey: ['applications', 'engine'] }),
      ]),
  });
}
