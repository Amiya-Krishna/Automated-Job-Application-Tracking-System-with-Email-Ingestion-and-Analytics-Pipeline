import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { getAnalyticsSummary, getFunnel } from '@/services/analytics';

export function useAnalyticsSummary(rangeDays = 30) {
  const { status } = useAuth();

  return useQuery({
    queryKey: ['analytics', 'summary', rangeDays],
    queryFn: () => getAnalyticsSummary(rangeDays),
    enabled: status === 'authenticated',
  });
}

export function useFunnel() {
  const { status } = useAuth();

  return useQuery({
    queryKey: ['analytics', 'funnel'],
    queryFn: getFunnel,
    enabled: status === 'authenticated',
  });
}
