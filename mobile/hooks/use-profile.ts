import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { getProfile } from '@/services/profile';

export function useProfile() {
  const { status } = useAuth();

  return useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
    enabled: status === 'authenticated',
  });
}
