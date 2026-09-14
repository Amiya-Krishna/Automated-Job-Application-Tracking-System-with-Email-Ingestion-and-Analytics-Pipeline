/**
 * GET /api/companies?search=&page=&pageSize= -> { data: Company[], meta }
 * GET /api/companies/:id -> { data: CompanyDetail }
 *
 * Matches server/routes/companiesRoutes.js exactly (verified by reading
 * it, not assumed). `companies` is global/shared discovery data (the
 * scraper's deduped employer catalog), not per-user — there is no
 * ownership dimension here the way tracked_jobs/applications have.
 */
export interface Company {
  id: number;
  name: string;
  normalizedName: string;
  domain: string | null;
  createdAt: string | null;
  jobCount: number;
}

export interface CompaniesMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface CompaniesListParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

/**
 * A single job row as companiesRoutes.js's GET /:id selects it — a
 * narrower shape than the full EngineJob (types/jobs.ts): no
 * description, no match_scores, no company (redundant — you're already
 * looking at that company's page).
 */
export interface CompanyDetailJob {
  id: number;
  title: string;
  status: string;
  location: string | null;
  remote_type: string | null;
  posted_at: string | null;
  source_url: string;
}

/**
 * `GET /:id` does NOT run through the same camelCase mapping the list
 * endpoint above does — it returns `prisma.companies.findUnique(...)`
 * spread as-is (see companiesRoutes.js), so top-level fields are the
 * raw snake_case column names, not `Company`'s camelCase shape. Typed
 * separately here rather than incorrectly extending `Company`.
 */
export interface CompanyDetail {
  id: number;
  name: string;
  normalized_name: string;
  domain: string | null;
  created_at: string | null;
  jobs: CompanyDetailJob[];
}
