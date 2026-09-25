import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { deleteScrapeRun, getScrapeHistory, getScrapeRun, triggerScrape } from '@/services/scrape';
import type { ScrapeRunStatus } from '@/types/scrape';

const TERMINAL: ScrapeRunStatus[] = ['succeeded', 'failed', 'blocked'];

/** Most recent 20 discovery runs (`GET /scrape/runs`) — same list the web client's "Recent runs" shows. */
export function useScrapeHistory() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ['scrape', 'history'],
    queryFn: getScrapeHistory,
    enabled: status === 'authenticated',
  });
}

/**
 * Polls a single run (`GET /scrape/runs/:id`) every 2s — the same interval
 * web's pollRun() uses — until it reaches a terminal status, then stops.
 * React Query's `refetchInterval` does the "clearInterval on finish" logic
 * for us, so there's no separate manual timer to manage/leak on unmount.
 */
export function useScrapeRunStatus(runId: number | null) {
  const { status } = useAuth();
  return useQuery({
    queryKey: ['scrape', 'run', runId],
    queryFn: () => getScrapeRun(runId as number),
    enabled: status === 'authenticated' && runId !== null,
    refetchInterval: (query) => (query.state.data && TERMINAL.includes(query.state.data.status) ? false : 2000),
  });
}

export function useTriggerScrape() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerScrape,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scrape', 'history'] }),
  });
}

export function useDeleteScrapeRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteScrapeRun(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scrape', 'history'] }),
  });
}