/**
 * Shared, backend-wide API types.
 *
 * Intentionally minimal at this stage: only the shapes the API client
 * itself needs to compile and to normalize errors consistently. Endpoint-
 * specific request/response types (TrackedJob, EngineJob, Profile, ...)
 * belong in their own feature files (e.g. types/applications.ts) once those
 * features are implemented, not here.
 */

/**
 * The backend's error responses are consistently `{ message: string }`
 * across every route (auth, jobs, engine, applications, analytics, etc.)
 * — confirmed by inspecting server/routes/*.js. This is the only error
 * shape the API client needs to know about.
 */
export interface ApiErrorResponse {
  message: string;
}

/**
 * Normalized error thrown by the API client for every failed request,
 * whether the failure came from the server (4xx/5xx with a JSON body),
 * the network (no response at all), or something else (request setup).
 *
 * Screens/hooks built in later phases can catch `ApiError` and rely on
 * `status` + `message` without needing to know anything about Axios.
 */
export class ApiError extends Error {
  /** HTTP status code, or `null` for network/timeout errors with no response. */
  status: number | null;
  /** True when the request never reached the server (offline, DNS, timeout). */
  isNetworkError: boolean;

  constructor(message: string, status: number | null, isNetworkError: boolean) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isNetworkError = isNetworkError;
  }
}
