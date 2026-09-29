/**
 * Useful cached reads: the non-sensitive query cache is mirrored to AsyncStorage
 * (see utils/query-cache.ts for exactly what qualifies) so the app opens with
 * real data offline. Scoped to one user; wiped on logout/session end.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query';

import { logger } from '@/services/logger';
import { isCacheRestorable, shouldPersistQuery, type PersistedCache } from '@/utils/query-cache';

const KEY = '@tracktrail/query-cache/v1';
let unsubscribe: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export async function restoreQueryCache(client: QueryClient, userId: number | null): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    const cache = JSON.parse(raw) as PersistedCache;
    if (!isCacheRestorable(cache, userId)) {
      await AsyncStorage.removeItem(KEY);
      return;
    }
    hydrate(client, cache.state as never);
  } catch {
    await AsyncStorage.removeItem(KEY).catch(() => {});
  }
}

/** Starts mirroring the cache (throttled). Safe to call repeatedly. */
export function startQueryPersistence(client: QueryClient, userId: number): void {
  stopQueryPersistence();
  const save = () => {
    timer = null;
    try {
      const state = dehydrate(client, {
        shouldDehydrateQuery: (q) => q.state.status === 'success' && shouldPersistQuery(q.queryKey),
      });
      const payload: PersistedCache = { v: 1, userId, savedAt: Date.now(), state };
      void AsyncStorage.setItem(KEY, JSON.stringify(payload));
    } catch (e) {
      logger.warn('query cache save failed');
    }
  };
  unsubscribe = client.getQueryCache().subscribe(() => {
    if (!timer) timer = setTimeout(save, 2000);
  });
}

export function stopQueryPersistence(): void {
  unsubscribe?.();
  unsubscribe = null;
  if (timer) clearTimeout(timer);
  timer = null;
}

export async function clearQueryCache(): Promise<void> {
  stopQueryPersistence();
  await AsyncStorage.removeItem(KEY).catch(() => {});
}
