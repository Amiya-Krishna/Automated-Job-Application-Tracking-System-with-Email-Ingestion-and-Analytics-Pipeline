import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { ApiError } from '@/types/api';

/** Errors that will not fix themselves on retry. */
function isPermanent(error: unknown): boolean {
  return error instanceof ApiError && error.status !== null && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
}

/**
 * The one place TanStack Query is configured.
 *
 * Network/429/5xx retrying for GETs already happens in services/api.ts
 * (backoff, Retry-After), so query-level retries are deliberately limited to
 * ONE extra attempt on transient failures — never on 4xx (a 401/403/404 will not
 * heal) and never while offline (queries pause and resume on reconnect via the
 * onlineManager wired in services/network.ts).
 */
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => !isPermanent(error) && failureCount < 1,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        staleTime: 30_000,
        // Long enough to keep the offline cache around while the app is backgrounded.
        gcTime: 30 * 60 * 1000,
        refetchOnReconnect: true,
        refetchOnWindowFocus: true, // = app returns to foreground (see services/network.ts)
      },
      mutations: {
        // Writes fail fast with a clear "you're offline" message instead of hanging.
        networkMode: 'always',
        retry: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
