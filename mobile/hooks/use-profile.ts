import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { getProfile, updateProfile } from '@/services/profile';

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });
}
