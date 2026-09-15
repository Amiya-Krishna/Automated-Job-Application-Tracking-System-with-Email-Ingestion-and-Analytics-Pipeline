/**
 * Types for the authentication endpoints only. Matches the actual
 * request/response shapes in server/routes/authRoutes.js exactly —
 * verified by reading that file, not assumed:
 *
 *   POST /api/auth/register  { name, email, password } -> 201 { message }
 *     (no token — registration does not log the user in)
 *   POST /api/auth/login     { email, password }        -> 200 { token, user }
 */

export interface AuthUser {
  id: number;
  name: string;
  email: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface RegisterResponse {
  message: string;
}

/**
 * POST /api/auth/forgot-password  { email } -> 200 { message }
 *
 * Always returns the same generic message whether or not the account
 * exists (server/routes/authRoutes.js is deliberately non-enumerating),
 * so the UI should treat every 200 response as "check your email",
 * never as confirmation the account exists.
 */
/**
 * POST /api/auth/forgot-password  { email } -> 200 { message }
 *
 * Always returns the same generic message whether or not the account
 * exists (server/routes/authRoutes.js is deliberately non-enumerating),
 * so the UI should treat every 200 response as "check your email",
 * never as confirmation the account exists.
 *
 * `source`/`redirectUri` are how mobile gets its OWN reset email link,
 * completely separate from the web link — same mechanism as Gmail
 * OAuth's mobile flow (see mobile/hooks/use-gmail.ts and
 * server/routes/gmailRoutes.js): `redirectUri` is this app's own deep
 * link built with `Linking.createURL(...)`, validated server-side
 * against a `mobile://`/`exp://` allow-list (server/utils/mobileRedirect.js)
 * so it can't become an open redirect. Web never sends these fields, so
 * it always gets the unchanged `${CLIENT_URL}/reset-password` link —
 * the two platforms' reset emails never cross over.
 */
export interface ForgotPasswordRequest {
  email: string;
  source?: 'mobile';
  redirectUri?: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

/**
 * POST /api/auth/reset-password  { token, password } -> 200 { message }
 *
 * `token` is a short-lived (30 min) signed JWT emailed as a link to
 * `${CLIENT_URL}/reset-password?token=...` — the WEB client's own
 * domain, not a mobile deep link (see server/routes/authRoutes.js's
 * forgot-password handler: there is no per-request source/redirect
 * parameter the way Gmail OAuth has, so the server can't target the
 * mobile app's scheme without changing what every platform's reset
 * email links to). The mobile Reset Password screen therefore has the
 * user paste in the token from that email manually — see
 * app/(auth)/reset-password.tsx for the full explanation of why a true
 * one-tap deep link isn't implemented here without a scoped-in backend/
 * native-config decision.
 */
export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface ResetPasswordResponse {
  message: string;
}
