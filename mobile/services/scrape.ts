import { api } from '@/services/api';
import type { ScrapeRun, TriggerScrapeInput, TriggerScrapeResult } from '@/types/scrape';

/** POST /api/scrape/run — same endpoint/contract the web client's JobDiscovery.jsx uses. */
export async function triggerScrape(input: TriggerScrapeInput): Promise<TriggerScrapeResult> {
  const { data } = await api.post<TriggerScrapeResult>('/scrape/run', input);
  return data;
}

/** GET /api/scrape/runs/:id — poll target while a run is queued/running. */
export async function getScrapeRun(id: number): Promise<ScrapeRun> {
  const { data } = await api.get<{ data: ScrapeRun }>(`/scrape/runs/${id}`);
  return data.data;
}

/** GET /api/scrape/runs — the current user's most recent discovery runs. */
export async function getScrapeHistory(): Promise<ScrapeRun[]> {
  const { data } = await api.get<{ data: ScrapeRun[] }>('/scrape/runs');
  return data.data;
}

/** DELETE /api/scrape/runs/:id — removes one of the user's own run-history rows (never a job). */
export async function deleteScrapeRun(id: number): Promise<void> {
  await api.delete(`/scrape/runs/${id}`);
}