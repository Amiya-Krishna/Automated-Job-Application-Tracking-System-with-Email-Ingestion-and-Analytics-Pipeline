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

const STORAGE_KEY = '@tracktrail/saved-jobs';

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

export async function getSavedJobs(): Promise<EngineJob[]> {
  if (cachedJobs !== null) return cachedJobs;

  const raw = await AsyncStorage.getItem(STORAGE_KEY);
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

export async function saveJob(job: EngineJob): Promise<EngineJob[]> {
  const current = await getSavedJobs();
  if (current.some((item) => item.id === job.id)) return current;

  const previous = current;
  const next = [job, ...current];

  // Optimistic update: every mounted screen reflects the tap immediately.
  publish(next);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch (error) {
    publish(previous);
    throw error;
  }
}
