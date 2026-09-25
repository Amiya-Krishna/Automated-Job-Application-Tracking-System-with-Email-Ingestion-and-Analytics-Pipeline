/**
 * Centralized API client for the existing Express backend.
 *
 * This is the ONLY place in the mobile app that should:
 *   - know the API base URL
 *   - know the backend's auth header convention
 *   - construct an Axios instance
 *
 * Feature-specific request functions (e.g. `services/applications.ts`,
 * `services/jobs.ts`, once those features are built) should import `api`
 * from this file and call `api.get(...)`/`api.post(...)` — they should
 * never construct their own Axios instance or reach into env vars
 * themselves. That's what keeps auth/error handling in one place instead
 * of scattered across the app.
 */
import axios, { AxiosError, type AxiosInstance } from 'axios';

import { emitUnauthorized } from '@/services/sessionEvents';
import { getToken, clearToken } from '@/services/tokenStore';
import { ApiError, type ApiErrorResponse } from '@/types/api';

const rawBaseUrl = process.env.EXPO_PUBLIC_API_URL;

if (!rawBaseUrl) {
  // Fail loudly at startup rather than silently sending every request to
  // `undefined` and producing a confusing network error later. See
  // mobile/.env.example for how to set this per environment.
  console.error(
    '[api] EXPO_PUBLIC_API_URL is not set. Copy mobile/.env.example to ' +
      'mobile/.env and set it for your environment (see the comments in ' +
      'that file for emulator vs. physical device vs. production).',
  );
}

// EXPO_PUBLIC_API_URL is the bare server root (e.g. http://10.0.2.2:5000),
// matching the web client's VITE_API_BASE_URL convention exactly
// (client/src/api.js) — every backend route is mounted under /api, so it's
// appended once here rather than repeated in every service file's paths.
const baseURL = `${(rawBaseUrl ?? '').replace(/\/+$/, '')}/api`;

export const api: AxiosInstance = axios.create({
  baseURL,
  // 60s, not 15s: the production API (see .env) runs on a Render free-tier
  // web service, which spins down after 15 minutes idle and takes 30-60s
  // to cold-start on the next request. A short timeout here was turning a
  // slow-but-successful wake-up into a hard "could not reach the server"
  // failure on the first request after inactivity.
  timeout: 60000,
});

// --- TEMP DIAGNOSTIC (dev-only) — remove once the mobile login issue is
// confirmed fixed.
//
// Pings GET /health once when the app starts, from the SAME device/network
// path a real login request would use, to answer "can this mobile runtime
// reach Render at all" independently of the login route. Deliberately uses
// a plain axios.get() with `rawBaseUrl` (NOT the `api` instance / `baseURL`
// above) because /health is mounted at the server root in server.js, not
// under /api — calling it through `api` would hit /api/health, get a 404,
// and look like a failure that has nothing to do with real connectivity.
if (__DEV__ && rawBaseUrl) {
  const healthUrl = `${rawBaseUrl.replace(/\/+$/, '')}/health`;
  const startedAt = Date.now();
  axios
    .get(healthUrl, { timeout: 60000 })
    .then((res) => {
      // eslint-disable-next-line no-console
      console.log(`[api][diag] GET ${healthUrl} → ${res.status} in ${Date.now() - startedAt}ms`, res.data);
    })
    .catch((err: AxiosError) => {
      // eslint-disable-next-line no-console
      console.log(
        `[api][diag] GET ${healthUrl} FAILED after ${Date.now() - startedAt}ms:`,
        JSON.stringify({
          code: err.code ?? null,
          message: err.message,
          hasResponse: Boolean(err.response),
          hasRequest: Boolean(err.request),
          status: err.response?.status ?? null,
        }),
      );
    });
}

// --- Request: attach the backend's custom auth header -----------------
//
// The backend (server/middleware/authMiddleware.js) reads the JWT from a
// plain `token` header, NOT the standard `Authorization: Bearer ...`.
// This is a deliberate choice to avoid a backend change (see Phase-3
// analysis) — every request goes through here, so this is the one and
// only place that convention is encoded.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.set('token', token);
  }

  // --- TEMP DIAGNOSTIC (dev-only) — remove once the mobile login issue
  // is confirmed fixed. Logs only routing info, never the body/headers
  // (so no password, no token) — see the response-side logging below for
  // the same rule.
  if (__DEV__) {
    const fullUrl = `${config.baseURL ?? ''}${config.url ?? ''}`;
    // eslint-disable-next-line no-console
    console.log(`[api][diag] → ${(config.method ?? '?').toUpperCase()} ${fullUrl} (timeout=${config.timeout}ms)`);
  }

  return config;
});

// --- Response: normalize errors, react to 401 --------------------------
api.interceptors.response.use(
  (response) => {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log(`[api][diag] ← ${response.status} ${response.config.url}`);
    }
    return response;
  },
  (error: AxiosError<ApiErrorResponse>) => {
    // A request made with `responseType: 'arraybuffer'` (the resume
    // download/export endpoints — see services/resume.ts) gets its error
    // body back as raw bytes too, not parsed JSON, so `error.response.data`
    // would otherwise be an ArrayBuffer instead of `{ message, code }` and
    // every branch below that reads `data?.message`/`data?.code` would see
    // nothing. Decode it back to JSON here, once, generically, so this
    // interceptor keeps working for any current or future binary endpoint
    // without each caller re-implementing the same decode.
    if (error.response?.data instanceof ArrayBuffer) {
      try {
        const text = String.fromCharCode(...new Uint8Array(error.response.data));
        error.response.data = JSON.parse(text) as ApiErrorResponse;
      } catch {
        // Not JSON (e.g. an HTML error page from a proxy) — leave as-is;
        // the generic fallback messages below still apply.
      }
    }

    // --- TEMP DIAGNOSTIC (dev-only) — remove once the mobile login issue
    // is confirmed fixed. Logs exactly the fields needed to tell "never
    // left the device" (no error.request) apart from "sent but no reply"
    // (error.request set, error.response not) apart from "got a real HTTP
    // response" (error.response set) — never logs headers/body, so no
    // token/password/secret ever reaches the console.
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log(
        '[api][diag] request failed:',
        JSON.stringify({
          url: `${error.config?.baseURL ?? ''}${error.config?.url ?? ''}`,
          method: error.config?.method,
          timeout: error.config?.timeout,
          code: error.code ?? null,
          message: error.message,
          hasResponse: Boolean(error.response),
          hasRequest: Boolean(error.request),
          status: error.response?.status ?? null,
        }),
      );
    }

    if (!error.response) {
      // Request never reached the server. This used to be collapsed into
      // a single "must be Render waking up" message no matter the actual
      // cause, which hid real problems (a bad EXPO_PUBLIC_API_URL, no
      // internet, DNS failure, a mid-request crash) behind a message that
      // told the developer to just "wait a moment" — see mobile/README or
      // git history for the prior version if you need it.
      //
      // Axios sets `error.code` for this class of error (no HTTP response
      // was ever received), and the two cases mean very different things:
      //
      //  - 'ECONNABORTED' means OUR OWN `timeout: 60000` above fired — the
      //    connection was established and we gave up waiting on a
      //    response. This is genuinely consistent with a Render free-tier
      //    cold start (which can take 30-60s), so the "waking up" message
      //    is accurate here.
      //  - anything else ('ERR_NETWORK', or no code at all on older
      //    engines) means the request failed before or without ever
      //    getting that far — offline, DNS failure, connection refused,
      //    TLS error, or a malformed baseURL (e.g. EXPO_PUBLIC_API_URL
      //    unset, see the startup console.error above). None of those are
      //    "the server is slow" — the server was never reached at all —
      //    so they get a distinct, honest message instead.
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.error(
          `[api] Request failed with no response. code=${error.code ?? '(none)'} message="${error.message}" baseURL=${baseURL}`,
        );
      }

      const isTimeout = error.code === 'ECONNABORTED';
      const message = isTimeout
        ? 'The server is taking longer than usual to respond — it may still be waking up after being idle. Please wait a moment and try again.'
        : 'Unable to connect to the server. Check your internet connection and try again.';

      return Promise.reject(new ApiError(message, null, true, error.code ?? null));
    }

    const { status, data } = error.response;

    if (status === 401) {
      // The backend's authMiddleware.js returns 401 for both "no token"
      // and an expired/invalid one. Either way, the stored token is no
      // longer usable. clearToken() clears the in-memory token
      // synchronously (its first line) before doing the async SecureStore
      // delete, so getToken() reflects "logged out" immediately for any
      // request that reads it next — we don't need to await the
      // SecureStore write to finish before moving on. emitUnauthorized()
      // lets AuthProvider (providers/AuthProvider.tsx) react and update
      // auth state; this module deliberately does NOT redirect anywhere
      // itself or touch auth state directly.
      void clearToken();
      emitUnauthorized();
    }

    // For 400/401 the backend's own message is already user-facing (e.g.
    // "Invalid Password", "User not found", "Token is not valid" — see
    // server/routes/authRoutes.js and server/middleware/authMiddleware.js)
    // and should be shown as-is. For 5xx, the backend's `message` is
    // `error.message` straight from an exception (see server.js's catch-
    // all handler and every route's `catch` block) — that can be an
    // internal detail (a Postgres error, a stack fragment), so it's
    // deliberately NOT shown to the user; a generic message is used
    // instead, and the real one only goes to the dev console.
    let message: string;
    if (status >= 500) {
      if (__DEV__ && data?.message) {
        // eslint-disable-next-line no-console
        console.error(`[api] Server error ${status}: ${data.message}`);
      }
      message = 'Server error. Please try again.';
    } else {
      message = data?.message || 'Something went wrong. Please try again.';
    }

    return Promise.reject(new ApiError(message, status, false, error.code ?? null, data?.code ?? null));
  },
);