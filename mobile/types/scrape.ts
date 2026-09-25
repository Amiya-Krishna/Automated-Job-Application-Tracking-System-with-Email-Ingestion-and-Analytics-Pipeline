/**
 * Matches server/routes/scrapeRoutes.js exactly (verified by reading it —
 * same contract client/src/pages/JobDiscovery.jsx already relies on).
 *
 *   POST /api/scrape/run  -> { status: "queued", runId, sources }
 *   GET  /api/scrape/runs/:id -> { data: ScrapeRun }
 *   GET  /api/scrape/runs     -> { data: ScrapeRun[] }   (most recent 20)
 *   DELETE /api/scrape/runs/:id -> the user's own run-history row only
 */
export type ScrapeRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked';

export interface ScrapeSourceResult {
  status: 'ok' | 'unavailable' | 'blocked' | 'error';
  message?: string | null;
  found?: number;
  ingested?: number;
}

export interface ScrapeRun {
  id: number;
  userId: number;
  query: string;
  location: string | null;
  sources: string[];
  limitPerSource: number;
  status: ScrapeRunStatus;
  results: Record<string, ScrapeSourceResult> | null;
  createdAt: string;
  updatedAt?: string;
}

export interface TriggerScrapeInput {
  query: string;
  location?: string;
  sources?: string[];
  limit?: number;
}

export interface TriggerScrapeResult {
  status: 'queued';
  runId: number;
  sources: string[];
}