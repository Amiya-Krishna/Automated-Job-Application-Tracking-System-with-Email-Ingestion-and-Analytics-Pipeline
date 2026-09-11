import { api } from '@/services/api';
import type { LoginRequest, LoginResponse, RegisterRequest, RegisterResponse } from '@/types/auth';

/** POST /api/auth/login — returns a JWT + the user record on success. */
export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', payload);
  return data;
}

/**
 * POST /api/auth/register — creates the account only. Deliberately does
 * NOT return a token (see server/routes/authRoutes.js) and does not log
 * the user in — callers should send them to the login screen afterward,
 * matching the existing web client's intended flow (client/src/pages/Register.jsx).
 */
export async function register(payload: RegisterRequest): Promise<RegisterResponse> {
  const { data } = await api.post<RegisterResponse>('/auth/register', payload);
  return data;
}
