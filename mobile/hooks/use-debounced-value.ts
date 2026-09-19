import { useEffect, useState } from 'react';

/**
 * Search on the Jobs tab filters an already-loaded, in-memory array (see
 * app/(drawer)/(tabs)/jobs.tsx — there is no server-side text search param on
 * GET /api/engine/jobs), so this isn't debouncing network requests. It's
 * still worth debouncing the derived filtered list so fast typing on a
 * larger loaded set doesn't re-filter/re-render on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
