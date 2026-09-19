import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { getProfile, updateProfile } from '@/services/profile';
import { emitNotificationEvent } from '@/services/notifications';

export function useProfile() {
  const { status } = useAuth();

  return useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
    enabled: status === 'authenticated',
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (_result, input) => {
      if (input.resumeText.trim().length > 0) {
        emitNotificationEvent({ type: 'resume_updated' });
      }
      return queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
