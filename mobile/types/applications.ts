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

/**
 * The raw `tracked_jobs` row shape returned by:
 *   - POST /api/jobs        -> 201/200 { ...TrackedJobRecord, duplicate: boolean }
 *
 * (verified by reading server/routes/jobRoutes.js — not assumed). Unlike
 * AppliedJob above (the normalized/joined view), this is the bare Prisma
 * row: `engineJobId` here is a real number (TrackedJob.engineJobId is
 * `BigInt?` in schema.prisma, safely a plain number via lib/prisma.js's
 * BigInt.prototype.toJSON patch — see types/jobs.ts's EngineJob.id comment
 * for the same patch), NOT the stringified version AppliedJob.engineJobId
 * uses.
 *
 * PUT /api/jobs/:id does NOT return this shape — it returns only
 * `{ message: string }` (see jobRoutes.js), so callers must invalidate
 * and re-read from the AppliedJob list rather than use a mutation
 * response for the updated row.
 */
export interface TrackedJobRecord {
  id: number;
  userId: number;
  company: string;
  role: string;
  status: string | null;
  interviewDate: string | null;
  notes: string | null;
  applicationDate: string;
  sourceName: string | null;
  sourceUrl: string | null;
  externalJobId: string | null;
  description: string | null;
  location: string | null;
  engineJobId: number | null;
  duplicate: boolean;
}

/**
 * Body accepted by POST /api/jobs (create) and PUT /api/jobs/:id (update).
 * Matches jobRoutes.js exactly: `company` and `role` are the only fields
 * POST actually requires (400 if missing); PUT accepts a partial subset
 * of the same fields with no required fields (it merges into the
 * existing row). `duplicateStrategy` is explicitly stripped server-side
 * if sent, so it is intentionally not part of this type.
 *
 * Date fields are plain strings, not Date objects — see jobRoutes.js's
 * normalizeInterviewDate(): interviewDate is a VarChar(50) column, stored
 * exactly as sent (expects "yyyy-mm-dd"), and applicationDate is coerced
 * server-side with `new Date(...)` from an ISO string.
 */
export interface TrackedJobInput {
  company?: string;
  role?: string;
  status?: string;
  interviewDate?: string | null;
  notes?: string | null;
  applicationDate?: string;
  sourceName?: string;
  sourceUrl?: string | null;
  externalJobId?: string | null;
  description?: string | null;
  location?: string | null;
}

export type CreateApplicationInput = TrackedJobInput &
  Required<Pick<TrackedJobInput, 'company' | 'role'>>;

export type UpdateApplicationInput = TrackedJobInput;

/**
 * The four values actually used across the app for TrackedJob.status
 * (Title Case) — see components/status-badge.tsx's STATUS_COLORS and
 * server/services/analyticsService.js's WINDOW_SQL, which both hardcode
 * exactly these four. The backend does not enforce this as a strict
 * enum/CHECK constraint (TrackedJob.status is a plain VarChar(50) with
 * no validation in jobRoutes.js), but every part of the system that
 * reads it treats these four as the only meaningful values, so the
 * mobile UI is restricted to them too rather than allowing arbitrary
 * free text that the rest of the app wouldn't recognize.
 */
export const TRACKED_JOB_STATUSES = ['Applied', 'Interview', 'Offer', 'Rejected'] as const;
export type TrackedJobStatus = (typeof TRACKED_JOB_STATUSES)[number];

/**
 * GET /api/applications -> { data: EngineApplication[] }
 *
 * The automated apply-engine's own record — see services/applications.ts
 * and server/routes/applyRoutes.js's ownership-note comment for why this
 * is a *different* table from TrackedJob/AppliedJob above. Used to
 * resolve the numeric id that POST /:id/submit and POST /:id/outcome
 * require (AppliedJob.engineApplicationStatus tells you the status as a
 * string, but never exposes this row's own id), and — via its nested
 * `jobs`/`companies` fields — to render the standalone Engine
 * Applications screen, which has no other source for a job's name.
 * `playwright_log` (a Json? column) is still omitted: its shape is
 * undocumented/unused by any screen, so it is not guessed here.
 */
export interface EngineApplication {
  id: number;
  job_id: number;
  /** "pending" | "applied" | "interview" | "rejected" | "offer" — see applyRoutes.js. Lowercase, unlike TrackedJobStatus. */
  status: string;
  applied_at: string | null;
  failure_reason: string | null;
  retry_count: number | null;
  outcome_updated_at: string | null;
  created_at: string | null;
  /**
   * GET /api/applications includes this (applyRoutes.js:
   * `include: { jobs: { include: { companies: { select: { name: true } } } } }`)
   * but earlier screens (Application Detail) never needed it — they
   * already have the job's title/company from AppliedJob. The
   * standalone Engine Applications screen (app/engine-applications.tsx)
   * DOES need it, since it has no other source for a human-readable job
   * name. Only the fields actually rendered are declared here, not the
   * full `jobs` row Prisma returns — `jobs` is nullable because
   * `applications.job_id` itself is an optional FK in schema.prisma,
   * even though every row this app creates always sets it.
   */
  jobs: { id: number; title: string; companies: { name: string } | null } | null;
}

/** POST /api/applications/:id/outcome — the exact 3 values applyRoutes.js accepts (400 on anything else). */
export const OUTCOME_STATUSES = ['interview', 'rejected', 'offer'] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];
