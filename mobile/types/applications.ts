/**
 * GET /api/jobs/applied -> { data: AppliedJob[] }
 *
 * Matches server/services/appliedJobsService.js's mapped return shape
 * exactly (verified by reading that file, not assumed). This is the
 * unified view across manual entries, the browser extension, Gmail
 * imports, and (where applicable) the automated apply engine — one row
 * per tracked job, which is why this is used for the Applications
 * screen rather than the lower-level GET /api/applications (see
 * services/applications.ts for why).
 *
 * No pagination: this endpoint returns the user's full tracked-jobs
 * list in one response (confirmed by reading jobRoutes.js — no
 * page/limit query params, no meta object). The Applications screen
 * therefore does not implement infinite scroll against this endpoint;
 * see components using this type for how that's handled.
 */
export interface AppliedJob {
  id: string; // `tracked-${trackedJobId}`, already a stable string
  trackedJobId: number;
  title: string;
  company: string;
  location: string | null;
  status: string; // e.g. "Applied" | "Interview" | "Offer" | "Rejected" — not a strict enum in the backend, see jobRoutes.js
  source: string; // "manual" | "extension" | "gmail" | ... — whatever sourceName was set to
  appliedDate: string; // tracked_jobs.application_date, a DATE column -> ISO date string
  interviewDate: string | null;
  notes: string | null;
  /**
   * A match_scores.score value, which Prisma returns as a Decimal and
   * therefore serializes to a JSON string (see utils/format.ts's
   * toNumber() for why) — or the number 0-100 if the backend's
   * `Number(s.score)` cast already ran (it does, in
   * appliedJobsService.js: `Number(s.score)`), so this one field is
   * already a plain number by the time it reaches the client. Kept as
   * `number | null` accordingly — null when the job never entered the
   * matching pipeline.
   */
  matchScore: number | null;
  sourceUrl: string | null;
  engineJobId: string | null;
  engineApplicationStatus: string | null;
}
