/**
 * "Saved Jobs" (the drawer's bookmark list) is a device-local feature —
 * GET /api/engine/jobs has no bookmark/favorite flag or endpoint
 * (verified by reading engineJobsRoutes.js), so there is nothing to sync
 * to the backend yet. The full EngineJob snapshot is stored, not just an
 * id, so the Saved Jobs screen can render a JobCard immediately without
 * an extra fetch (and still shows something sensible if that job later
 * disappears from the live feed).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { EngineJob } from '@/types/jobs';

// Saved jobs can include the user's own PRIVATE jobs, so the list is stored per account and the
// in-memory copy is dropped when the account changes or signs out. The old single shared key is
// removed.
const LEGACY_STORAGE_KEY = '@tracktrail/saved-jobs';
let currentUserId: number | null = null;
const storageKey = () => (currentUserId == null ? null : `${LEGACY_STORAGE_KEY}/u${currentUserId}`);

type SavedJobsListener = (jobs: EngineJob[]) => void;
const listeners = new Set<SavedJobsListener>();
let cachedJobs: EngineJob[] | null = null;

function publish(jobs: EngineJob[]) {
  cachedJobs = jobs;
  listeners.forEach((listener) => listener(jobs));
}

export function subscribeSavedJobs(listener: SavedJobsListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Call on sign-in (id) and sign-out (null). Clears the previous account's list at once. */
export async function setSavedJobsUser(userId: number | null): Promise<void> {
  if (currentUserId === userId) return;
  currentUserId = userId;
  publish([]);
  cachedJobs = null;
  void AsyncStorage.removeItem(LEGACY_STORAGE_KEY).catch(() => {});
  if (userId != null) {
    const loaded = await getSavedJobs();
    if (currentUserId === userId) publish(loaded);
  }
}

/** Removes an account's on-device saved-jobs list (used after the account is deleted). */
export async function purgeSavedJobsForUser(userId: number): Promise<void> {
  await AsyncStorage.removeItem(`${LEGACY_STORAGE_KEY}/u${userId}`).catch(() => {});
}

export async function getSavedJobs(): Promise<EngineJob[]> {
  if (cachedJobs !== null) return cachedJobs;
  const key = storageKey();
  if (!key) return [];
  const forUser = currentUserId;

  const raw = await AsyncStorage.getItem(key);
  if (forUser !== currentUserId) return [];
  if (!raw) {
    cachedJobs = [];
    return cachedJobs;
  }

  try {
    cachedJobs = JSON.parse(raw) as EngineJob[];
  } catch {
    cachedJobs = [];
  }
  return cachedJobs;
}

async function persist(jobs: EngineJob[]) {
  const key = storageKey();
  if (!key) throw new Error('Sign in to save jobs');
  await AsyncStorage.setItem(key, JSON.stringify(jobs));
}

export async function saveJob(job: EngineJob): Promise<EngineJob[]> {
  const current = await getSavedJobs();
  if (current.some((item) => item.id === job.id)) return current;

  const previous = current;
  const next = [job, ...current];

  // Optimistic update: every mounted screen reflects the tap immediately.
  publish(next);
  try {
    await persist(next);
    return next;
  } catch (error) {
    // Storage is the durable source of truth; restore the last known value if it fails.
    publish(previous);
    throw error;
  }
}

export async function unsaveJob(jobId: number): Promise<EngineJob[]> {
  const current = await getSavedJobs();
  if (!current.some((item) => item.id === jobId)) return current;

  const previous = current;
  const next = current.filter((item) => item.id !== jobId);

  // Optimistic update: the star disappears immediately.
  publish(next);
  try {
    await persist(next);
    return next;
  } catch (error) {
    publish(previous);
    throw error;
  }
}
