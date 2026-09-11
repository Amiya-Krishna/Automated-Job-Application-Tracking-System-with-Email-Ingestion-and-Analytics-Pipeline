import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { ApiError } from '@/types/api';

/**
 * The one place TanStack Query is configured. Screens/hooks never
 * construct their own QueryClient or set per-query defaults for things
 * like retry behavior — that belongs here, not scattered per-screen.
 */
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A 401 means "not authorized," not "transient failure" — retrying
        // it just repeats the same failure (and would re-trigger
        // services/sessionEvents.ts's emitUnauthorized() multiple times).
        // Anything else gets one retry; mobile networks are flaky enough
        // that a bare no-retry default would be too aggressive.
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status === 401) return false;
          return failureCount < 1;
        },
        staleTime: 30_000,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  // useState (not a module-level singleton) so the client is created once
  // per app instance, not once per JS module evaluation — the standard
  // TanStack Query + React Native/SSR-safe pattern.
  const [queryClient] = useState(createQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
