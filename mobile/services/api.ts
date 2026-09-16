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
  return config;
});

// --- Response: normalize errors, react to 401 --------------------------
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    if (!error.response) {
      // Request never reached the server: offline, DNS failure, timeout,
      // or (very commonly during development) EXPO_PUBLIC_API_URL points
      // at the wrong host for the current environment — see
      // mobile/.env.example.
      return Promise.reject(
        new ApiError(
          'Could not reach the server. It may still be waking up after being idle — please wait a moment and try again.',
          null,
          true,
        ),
      );
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

    const message = data?.message || 'Something went wrong. Please try again.';
    return Promise.reject(new ApiError(message, status, false));
  },
);
