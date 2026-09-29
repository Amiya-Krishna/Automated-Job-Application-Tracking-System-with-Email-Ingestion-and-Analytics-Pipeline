/**
 * Which queries may be written to the on-device cache. Pure (no native imports)
 * so it is unit-tested.
 *
 * Allow-list, not deny-list: only data that is useful offline AND not
 * sensitive is persisted (application/job lists, analytics numbers, sources,
 * companies). Resume text, profile (contains resume text), tailoring output,
 * Gmail status/scan results and anything unknown are NEVER written to disk.
 */
const PERSISTED_ROOTS = new Set(['applications', 'analytics', 'jobs', 'sources', 'companies']);

export function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  if (typeof root !== 'string' || !PERSISTED_ROOTS.has(root)) return false;
  // Infinite lists can hold many pages; the first screen of data is what's useful offline.
  if (queryKey.includes('infinite')) return false;
  return true;
}

export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface PersistedCache {
  v: 1;
  userId: number;
  savedAt: number;
  state: unknown;
}

/** A persisted cache is only restored for the SAME user and while it is fresh enough. */
export function isCacheRestorable(cache: PersistedCache | null, userId: number | null, now = Date.now()): boolean {
  return Boolean(cache && cache.v === 1 && userId != null && cache.userId === userId && now - cache.savedAt < CACHE_MAX_AGE_MS);
}
