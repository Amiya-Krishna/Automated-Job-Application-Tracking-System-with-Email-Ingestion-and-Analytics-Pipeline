/**
 * Shared, backend-wide API types: the error body shape and the normalized
 * ApiError every failed request is turned into by services/api.ts.
 */

/** The backend's error responses are `{ message, code? }` across every route. */
export interface ApiErrorResponse {
  message: string;
  /** Optional machine-readable code ("no_resume", "token_expired", "rate_limited", ...). */
  code?: string;
  /** Sent with 429 responses by server/middleware/rateLimit.js. */
  retryAfterSeconds?: number;
}

/** Shown when the server reports `account_blocked` and has no message of its own. */
export const ACCOUNT_BLOCKED_MESSAGE = 'Your account has been blocked. Please contact an administrator.';
/** Shown on the login screen after the user deleted their own account. */
export const ACCOUNT_DELETED_MESSAGE = 'Your account has been deleted.';

export class ApiError extends Error {
  /** HTTP status code, or `null` for network/timeout/offline errors with no response. */
  status: number | null;
  /** True when the request never reached the server (offline, DNS, timeout). */
  isNetworkError: boolean;
  /** Underlying Axios/client error code (ECONNABORTED, ERR_NETWORK, OFFLINE, ...). Diagnostics only. */
  code: string | null;
  /** The backend's own error code from the response body. Safe to branch UI on. */
  apiCode: string | null;
  /** Seconds the server asked us to wait (429), when known. */
  retryAfterSeconds: number | null;

  constructor(
    message: string,
    status: number | null,
    isNetworkError: boolean,
    code: string | null = null,
    apiCode: string | null = null,
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isNetworkError = isNetworkError;
    this.code = code;
    this.apiCode = apiCode;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
