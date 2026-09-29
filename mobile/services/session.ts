/**
 * Session refresh: exchanges the stored refresh token for a new access token
 * AND a new refresh token (the server rotates it on every use).
 *
 * Single-flight: any number of requests that hit an expired token at the same
 * moment share ONE refresh call. Two concurrent refreshes with the same token
 * would look like token theft to the server and end the session.
 *
 * Uses its own bare axios client (never the `api` instance) so a failing
 * refresh cannot recurse through the API client's 401 handling.
 */
import axios from 'axios';

import { API_BASE_URL, API_TIMEOUT_MS, getAppInfo } from '@/services/config';
import { getAccessExpiresAt, getRefreshToken, setSession } from '@/services/tokenStore';
import type { RefreshResponse } from '@/types/auth';

/**
 *  refreshed   - new tokens stored
 *  no_session  - there is no refresh token (legacy 7-day token, or signed out)
 *  invalid     - the server rejected the refresh token: the session is over
 *  unavailable - could not reach the server / server error: keep the session, try later
 */
export type RefreshOutcome = 'refreshed' | 'no_session' | 'invalid' | 'unavailable';

const client = axios.create({ baseURL: API_BASE_URL, timeout: API_TIMEOUT_MS });
let inflight: Promise<RefreshOutcome> | null = null;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function doRefresh(): Promise<RefreshOutcome> {
  const token = getRefreshToken();
  if (!token) return 'no_session';
  const info = getAppInfo();
  try {
    const { data } = await client.post<RefreshResponse>(
      '/auth/refresh',
      { refreshToken: token, device: { platform: info.platform, deviceName: info.deviceName } },
      { headers: { 'X-Client': 'mobile', 'X-App-Version': info.version } },
    );
    await setSession(
      { accessToken: data.accessToken, refreshToken: data.refreshToken, accessTokenExpiresAt: data.accessTokenExpiresAt },
      data.user,
    );
    return 'refreshed';
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    const code = axios.isAxiosError(err) ? (err.response?.data as { code?: string } | undefined)?.code : undefined;
    if (status === 401 && code === 'refresh_in_progress') {
      // Someone else just rotated this token; give their write a moment to land.
      await sleep(750);
      return getRefreshToken() !== token ? 'refreshed' : 'invalid';
    }
    if (status === 400 || status === 401 || status === 403) return 'invalid';
    return 'unavailable'; // no response, 429, 5xx: do NOT sign the user out
  }
}

export function refreshSession(): Promise<RefreshOutcome> {
  if (!inflight) {
    inflight = doRefresh().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/**
 * Refreshes proactively when the access token is missing/expired or about to
 * expire, so most requests never see a 401 at all.
 */
export async function ensureFreshAccessToken(minValidityMs = 30_000): Promise<RefreshOutcome | 'fresh'> {
  const exp = getAccessExpiresAt();
  if (exp == null || exp - Date.now() > minValidityMs) return 'fresh';
  return refreshSession();
}
