import * as SecureStore from 'expo-secure-store';

/**
 * Session storage, backed by Expo SecureStore (iOS Keychain / Android Keystore).
 *
 * What is stored
 *   - access token  (short-lived JWT, sent on every request)
 *   - refresh token (opaque, rotated on every refresh; stored ONLY here)
 *   - access-token expiry (ISO string, lets the API client refresh proactively)
 *   - a minimal cached user { id, name, email } so a cold start can render before
 *     the network answers (or while offline)
 * Nothing here is ever written to AsyncStorage, files, logs or crash reports.
 *
 * The API client needs the token synchronously on every request, so an
 * in-memory copy is the source of truth for reads; every write updates memory
 * first and then persists. `hydrateSession()` populates memory once at startup.
 *
 * Legacy: builds before refresh tokens stored a single 7-day JWT under
 * `auth_token`. It is still read as the access token, so an app update never
 * signs anyone out; once it expires the user signs in again and gets a session.
 */

const OPTIONS: SecureStore.SecureStoreOptions = {
  // Readable after first unlock (needed for background refresh) but never
  // migrated to another device via backup.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const KEY_ACCESS = 'auth_token'; // same key as older builds (legacy compatible)
const KEY_REFRESH = 'auth_refresh_token';
const KEY_EXPIRES = 'auth_access_expires_at';
const KEY_USER = 'auth_user';

export interface StoredUser {
  id: number;
  name: string;
  email: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken?: string | null;
  accessTokenExpiresAt?: string | null;
}

let accessToken: string | null = null;
let refreshToken: string | null = null;
let expiresAt: number | null = null;
let cachedUser: StoredUser | null = null;
let hasHydrated = false;

async function write(key: string, value: string | null): Promise<void> {
  try {
    if (value == null) await SecureStore.deleteItemAsync(key, OPTIONS);
    else await SecureStore.setItemAsync(key, value, OPTIONS);
  } catch {
    // A failed persist must not crash the session; memory still holds the value
    // for this run. (Never log the key's value.)
  }
}

/** Reads the persisted session into memory. Safe to call repeatedly. */
export async function hydrateSession(): Promise<{ hasSession: boolean }> {
  if (!hasHydrated) {
    try {
      const [a, r, e, u] = await Promise.all([
        SecureStore.getItemAsync(KEY_ACCESS, OPTIONS),
        SecureStore.getItemAsync(KEY_REFRESH, OPTIONS),
        SecureStore.getItemAsync(KEY_EXPIRES, OPTIONS),
        SecureStore.getItemAsync(KEY_USER, OPTIONS),
      ]);
      accessToken = a ?? null;
      refreshToken = r ?? null;
      const parsed = e ? Date.parse(e) : NaN;
      expiresAt = Number.isFinite(parsed) ? parsed : null;
      try {
        cachedUser = u ? (JSON.parse(u) as StoredUser) : null;
      } catch {
        cachedUser = null;
      }
    } catch {
      accessToken = refreshToken = null;
    }
    hasHydrated = true;
  }
  return { hasSession: Boolean(accessToken || refreshToken) };
}

/** @deprecated kept for older imports; prefer hydrateSession(). */
export async function hydrateToken(): Promise<string | null> {
  await hydrateSession();
  return accessToken;
}

export const isHydrated = () => hasHydrated;
export const getToken = (): string | null => accessToken;
export const getRefreshToken = (): string | null => refreshToken;
/** Epoch ms when the current access token expires, if known. */
export const getAccessExpiresAt = (): number | null => expiresAt;
export const getCachedUser = (): StoredUser | null => cachedUser;

/** Stores a full session (login / refresh). Memory first, then SecureStore. */
export async function setSession(tokens: SessionTokens, user?: StoredUser | null): Promise<void> {
  accessToken = tokens.accessToken;
  if (tokens.refreshToken !== undefined) refreshToken = tokens.refreshToken ?? null;
  const parsed = tokens.accessTokenExpiresAt ? Date.parse(tokens.accessTokenExpiresAt) : NaN;
  expiresAt = Number.isFinite(parsed) ? parsed : null;
  if (user) cachedUser = user;
  await Promise.all([
    write(KEY_ACCESS, accessToken),
    tokens.refreshToken !== undefined ? write(KEY_REFRESH, refreshToken) : Promise.resolve(),
    write(KEY_EXPIRES, tokens.accessTokenExpiresAt ?? null),
    user ? write(KEY_USER, JSON.stringify(user)) : Promise.resolve(),
  ]);
}

export async function setCachedUser(user: StoredUser): Promise<void> {
  cachedUser = user;
  await write(KEY_USER, JSON.stringify(user));
}

/** Back-compat: store just an access token. */
export async function setToken(token: string): Promise<void> {
  await setSession({ accessToken: token });
}

/** Clears everything, in memory first so getToken() reflects logout immediately. */
export async function clearSession(): Promise<void> {
  accessToken = refreshToken = null;
  expiresAt = null;
  cachedUser = null;
  await Promise.all([KEY_ACCESS, KEY_REFRESH, KEY_EXPIRES, KEY_USER].map((k) => write(k, null)));
}

/** Back-compat alias. */
export const clearToken = clearSession;
