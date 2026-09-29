import { api } from '@/services/api';
import { getAppInfo } from '@/services/config';
import type {
  AuthUser,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
} from '@/types/auth';

/**
 * POST /api/auth/login — the `X-Client: mobile` header (added by the API
 * client) makes the server return a short-lived access token + a rotating
 * refresh token instead of the legacy 7-day web token.
 */
export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const info = getAppInfo();
  const { data } = await api.post<LoginResponse>('/auth/login', {
    ...payload,
    client: 'mobile',
    device: { platform: info.platform, deviceName: info.deviceName },
  });
  return data;
}

/** POST /api/auth/register — creates the account only; does not log in. */
export async function register(payload: RegisterRequest): Promise<RegisterResponse> {
  const { data } = await api.post<RegisterResponse>('/auth/register', payload);
  return data;
}

/** GET /api/auth/me — validates the session and returns the current user. */
export async function fetchMe(): Promise<AuthUser & { gmailConnected?: boolean }> {
  const { data } = await api.get<{ user: AuthUser & { gmailConnected?: boolean } }>('/auth/me');
  return data.user;
}

/** POST /api/auth/logout — revokes the refresh-token family server-side. Best effort. */
export async function logoutRemote(refreshToken: string): Promise<void> {
  await api.post('/auth/logout', { refreshToken });
}

/** DELETE /api/auth/account — permanently deletes the account and its data. */
export async function deleteAccount(password: string): Promise<{ message: string }> {
  const { data } = await api.delete<{ message: string }>('/auth/account', { data: { password } });
  return data;
}

export async function forgotPassword(payload: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
  const { data } = await api.post<ForgotPasswordResponse>('/auth/forgot-password', payload);
  return data;
}

export async function resetPassword(payload: ResetPasswordRequest): Promise<ResetPasswordResponse> {
  const { data } = await api.post<ResetPasswordResponse>('/auth/reset-password', payload);
  return data;
}
