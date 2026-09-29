/**
 * Notification preferences, stored on the ACCOUNT (server) so reminders are
 * honoured on every device and by the backend scheduler. Optimistic updates
 * with rollback on failure. Turning push on also asks the OS for permission and
 * registers this device; turning it off unregisters it.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { registerForPushIfPermitted, requestPushPermission, unregisterPushDevice } from '@/services/push';
import { DEFAULT_REMOTE_PREFERENCES, fetchPreferences, savePreferences, type RemotePreferences } from '@/services/pushApi';

export type NotificationPreferences = RemotePreferences;
const KEY = ['notification-preferences'] as const;

export function useNotificationPreferences() {
  const { status } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({ queryKey: KEY, queryFn: fetchPreferences, enabled: status === 'authenticated', staleTime: 60_000 });

  const mutation = useMutation({
    mutationFn: async (patch: Partial<RemotePreferences>) => {
      if (patch.pushEnabled === true) {
        const permission = await requestPushPermission();
        if (permission === 'denied') throw new Error('Notifications are blocked for TrackTrail. Enable them in your phone settings.');
      }
      const saved = await savePreferences(patch);
      if (patch.pushEnabled === true) await registerForPushIfPermitted();
      if (patch.pushEnabled === false) await unregisterPushDevice();
      return saved;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<RemotePreferences>(KEY);
      qc.setQueryData<RemotePreferences>(KEY, { ...(previous ?? DEFAULT_REMOTE_PREFERENCES), ...patch });
      return { previous };
    },
    onError: (_e, _patch, ctx) => {
      if (ctx?.previous) qc.setQueryData(KEY, ctx.previous);
    },
    onSuccess: (saved) => qc.setQueryData(KEY, saved),
  });

  return {
    preferences: query.data ?? DEFAULT_REMOTE_PREFERENCES,
    update: (patch: Partial<RemotePreferences>) => mutation.mutate(patch),
    isReady: !query.isLoading,
    isError: query.isError,
    error: mutation.error ?? query.error,
    isSaving: mutation.isPending,
    refetch: query.refetch,
  };
}
