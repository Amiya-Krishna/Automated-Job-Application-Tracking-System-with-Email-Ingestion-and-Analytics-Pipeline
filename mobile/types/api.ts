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
  /**
   * Optional machine-readable code (e.g. "no_resume", "jd_too_short"). Only
   * the /api/resume/* routes send it; older routes never do.
   */
  code?: string;
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
  /**
   * The underlying Axios error code (e.g. 'ECONNABORTED' for our own
   * client-side timeout, 'ERR_NETWORK' for a connection that failed
   * outright), or `null` for HTTP error responses / unknown causes. Not
   * shown to the user — for logging/diagnostics only, so a real
   * connectivity problem can be told apart from a slow Render cold start
   * without guessing. See services/api.ts.
   */
  code: string | null;
  /**
   * The backend's own error code from the response body (e.g. "no_resume"),
   * for the few routes that send one (/api/resume/*). `null` otherwise. Unlike
   * `code` above, this is safe to branch UI on.
   */
  apiCode: string | null;

  constructor(
    message: string,
    status: number | null,
    isNetworkError: boolean,
    code: string | null = null,
    apiCode: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isNetworkError = isNetworkError;
    this.code = code;
    this.apiCode = apiCode;
  }
}