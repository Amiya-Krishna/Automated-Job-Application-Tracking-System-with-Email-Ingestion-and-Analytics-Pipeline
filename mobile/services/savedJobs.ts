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

export async function getSavedJobs(): Promise<EngineJob[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as EngineJob[];
  } catch {
    return [];
  }
}

export async function saveJob(job: EngineJob): Promise<EngineJob[]> {
  const current = await getSavedJobs();
  if (current.some((item) => item.id === job.id)) return current;
  const next = [job, ...current];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function unsaveJob(jobId: number): Promise<EngineJob[]> {
  const current = await getSavedJobs();
  const next = current.filter((item) => item.id !== jobId);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
