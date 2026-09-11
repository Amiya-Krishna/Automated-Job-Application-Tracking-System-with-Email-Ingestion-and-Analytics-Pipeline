import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { getGmailStatus } from '@/services/gmail';

export function useGmailStatus() {
  const { status } = useAuth();

  return useQuery({
    queryKey: ['gmail', 'status'],
    queryFn: getGmailStatus,
    enabled: status === 'authenticated',
  });
}
