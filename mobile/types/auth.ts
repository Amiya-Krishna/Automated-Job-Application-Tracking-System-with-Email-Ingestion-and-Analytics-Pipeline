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
