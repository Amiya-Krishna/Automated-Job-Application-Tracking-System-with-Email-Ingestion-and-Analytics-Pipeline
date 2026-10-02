/**
 * Centralized API client for the Express backend — the ONLY place that knows
 * the base URL, the auth header convention, retry policy and error shape.
 *
 * Session handling
 *   - Sends the access token in the backend's `token` header.
 *   - Refreshes proactively shortly before expiry, and reactively on a 401
 *     (single-flight, see services/session.ts), then replays the request once.
 *   - Signs the user out ONLY when the server says the session is over
 *     (refresh rejected, or a legacy token expired). A network failure while
 *     refreshing keeps the session so the user is not logged out for being on a
 *     train.
 * Reliability
 *   - Offline: fails immediately (no 45 s hang).
 *   - GET/HEAD: up to 2 retries with exponential backoff + jitter on network
 *     errors, timeouts (once), 502/503/504 and 429 (honouring Retry-After).
 *   - Writes are never auto-retried (no duplicate applications).
 * Security / privacy
 *   - Never logs URLs' query strings, headers or bodies. 5xx bodies are never
 *     shown to users (they can contain internals).
 */
import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

import { API_BASE_URL, API_CONFIG_OK, API_ORIGIN, API_TIMEOUT_MS, getAppInfo } from '@/services/config';
import { isOffline } from '@/services/connectivity';
import { reportError } from '@/services/logger';
import { ensureFreshAccessToken, refreshSession } from '@/services/session';
import { emitUnauthorized } from '@/services/sessionEvents';
import { clearSession, getRefreshToken, getToken } from '@/services/tokenStore';
import { ApiError, type ApiErrorResponse } from '@/types/api';

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retryCount?: number;
    _authRetried?: boolean;
    _healthWarmed?: boolean;
  }
}

const MAX_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 10_000;
// Endpoints where a 401 means "wrong/invalid input", never "session expired".
const AUTH_PUBLIC = /\/auth\/(login|register|refresh|logout|forgot-password|reset-password)$/;

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
});

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Render's free service can sleep after inactivity. A liveness request is
// deliberately separate from `api`, so waking the service never recurses
// through auth/refresh handling. It is only used after a GET has exhausted its
// normal network retries, and a successful health response triggers one final
// replay of the original request.
const healthClient = axios.create({
  baseURL: API_ORIGIN,
  timeout: Math.max(API_TIMEOUT_MS, 60_000),
});

async function warmBackend(): Promise<boolean> {
  if (!API_ORIGIN) return false;
  try {
    const response = await healthClient.get('/health');
    return response.status === 200 && response.data?.status === 'ok';
  } catch {
    return false;
  }
}
const isIdempotent = (c?: InternalAxiosRequestConfig) => ['get', 'head', 'options'].includes((c?.method ?? 'get').toLowerCase());
const backoff = (attempt: number) => Math.min(500 * 2 ** attempt, 4000) + Math.floor(Math.random() * 250);

function parseRetryAfter(header: unknown, body?: ApiErrorResponse): number | null {
  const fromBody = body?.retryAfterSeconds;
  if (typeof fromBody === 'number' && fromBody > 0) return fromBody;
  const n = Number(header);
  if (Number.isFinite(n) && n > 0) return n;
  const date = typeof header === 'string' ? Date.parse(header) : NaN;
  return Number.isFinite(date) ? Math.max(1, Math.ceil((date - Date.now()) / 1000)) : null;
}

function decodeBinaryBody(buf: ArrayBuffer): ApiErrorResponse | null {
  try {
    const bytes = new Uint8Array(buf);
    const text =
      typeof TextDecoder !== 'undefined'
        ? new TextDecoder().decode(bytes)
        : Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    return JSON.parse(text) as ApiErrorResponse;
  } catch {
    return null; // not JSON (e.g. an HTML error page from a proxy)
  }
}

// --- Request ------------------------------------------------------------
api.interceptors.request.use(async (config) => {
  if (!API_CONFIG_OK) {
    // A release build without a valid https API URL. Fail loudly and safely.
    throw new ApiError('This build is not configured correctly. Please update the app.', null, false, 'MISCONFIGURED');
  }
  if (isOffline()) {
    throw new ApiError("You're offline. Check your connection and try again.", null, true, 'OFFLINE');
  }

  const url = config.url ?? '';
  if (!AUTH_PUBLIC.test(url.split('?')[0]) && getRefreshToken()) {
    await ensureFreshAccessToken(); // 'unavailable' is fine: the request below may still succeed or 401
  }

  const token = getToken();
  if (token) config.headers.set('token', token);
  const info = getAppInfo();
  config.headers.set('X-Client', 'mobile');
  config.headers.set('X-App-Version', info.version);
  config.headers.set('X-Platform', info.platform);
  return config;
});

// --- Response -----------------------------------------------------------
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorResponse>) => {
    const config = error.config as InternalAxiosRequestConfig | undefined;

    // Already one of our own errors (thrown by the request interceptor).
    if (error instanceof ApiError || !config) return Promise.reject(error);

    if (error.response?.data instanceof ArrayBuffer) {
      const decoded = decodeBinaryBody(error.response.data);
      if (decoded) error.response.data = decoded;
    }

    const attempt = config._retryCount ?? 0;

    // ---- No response: offline / DNS / TLS / timeout ----
    if (!error.response) {
      const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
      const canRetry = isIdempotent(config) && !isOffline() && attempt < (isTimeout ? 1 : MAX_RETRIES);
      if (canRetry) {
        config._retryCount = attempt + 1;
        await sleep(backoff(attempt));
        return api.request(config);
      }
      // If the API is a sleeping Render instance, /health can wake it even
      // though the original request timed out. Only safe idempotent requests
      // get this extra recovery attempt; writes are never duplicated.
      if (isIdempotent(config) && !config._healthWarmed && !isOffline()) {
        config._healthWarmed = true;
        if (await warmBackend()) {
          config._retryCount = 0;
          return api.request(config);
        }
      }

      const message = isTimeout
        ? 'The server is taking longer than usual to respond. It may be waking up — please try again in a moment.'
        : 'Unable to connect to the server. Check your internet connection and try again.';
      return Promise.reject(new ApiError(message, null, true, error.code ?? null));
    }

    const { status, data } = error.response;
    const apiCode = data?.code ?? null;

    // ---- 401: recover the session, or end it ----
    if (status === 401 && !AUTH_PUBLIC.test((config.url ?? '').split('?')[0])) {
      if (!config._authRetried && getRefreshToken()) {
        const outcome = await refreshSession();
        if (outcome === 'refreshed') {
          config._authRetried = true;
          config.headers.set('token', getToken() ?? '');
          return api.request(config);
        }
        if (outcome === 'unavailable') {
          return Promise.reject(new ApiError("Couldn't refresh your session right now. Check your connection and try again.", null, true, 'REFRESH_UNAVAILABLE'));
        }
      }
      // Refresh rejected, no refresh token (legacy), or the replay still 401s.
      await clearSession();
      emitUnauthorized();
      return Promise.reject(new ApiError('Your session has expired. Please sign in again.', 401, false, null, apiCode ?? 'session_expired'));
    }

    // ---- 429 / 502 / 503 / 504: retry idempotent requests ----
    const retryAfter = status === 429 ? parseRetryAfter(error.response.headers?.['retry-after'], data) : null;
    const transient = status === 429 || status === 502 || status === 503 || status === 504;
    if (transient && isIdempotent(config) && attempt < MAX_RETRIES) {
      const wait = retryAfter != null ? retryAfter * 1000 : backoff(attempt);
      if (wait <= MAX_RETRY_WAIT_MS) {
        config._retryCount = attempt + 1;
        await sleep(wait);
        return api.request(config);
      }
    }

    // ---- Final, user-safe message ----
    let message: string;
    if (status === 429) {
      message = retryAfter
        ? `Too many requests. Please wait ${retryAfter} second${retryAfter === 1 ? '' : 's'} and try again.`
        : 'Too many requests. Please wait a moment and try again.';
    } else if (status >= 500) {
      reportError(new Error(`API ${status}`), { status, path: (config.url ?? '').split('?')[0] });
      message = 'Server error. Please try again.';
    } else {
      // 4xx bodies are written to be user-facing ("Invalid email or password").
      message = data?.message || 'Something went wrong. Please try again.';
    }
    return Promise.reject(new ApiError(message, status, false, error.code ?? null, apiCode, retryAfter));
  },
);
