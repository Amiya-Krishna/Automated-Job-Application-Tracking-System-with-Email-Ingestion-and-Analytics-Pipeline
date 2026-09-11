import * as SecureStore from 'expo-secure-store';

/**
 * Token storage, backed by Expo SecureStore.
 *
 * The API client (api.ts) needs to read the current JWT on every request
 * and needs a way to be told "the token is gone" (on logout, or after a
 * 401) — it should not know or care *how* the token is persisted. This
 * module isolates that: everything else in the app imports getToken/
 * setToken/clearToken from here and never touches SecureStore directly.
 *
 * SecureStore's API is async, but the Axios request interceptor needs a
 * synchronous value on every outgoing request (adding an await there
 * would slow down and complicate every single API call). The fix is an
 * in-memory copy that's the source of truth for reads, kept in sync with
 * SecureStore by every write:
 *
 *   - `hydrateToken()` is called ONCE, at app startup (by AuthProvider),
 *     before anything else renders. It does the one necessary async
 *     SecureStore read and populates the in-memory copy.
 *   - `getToken()` is synchronous and only ever reads the in-memory copy.
 *   - `setToken`/`clearToken` update the in-memory copy synchronously
 *     (so `getToken()` reflects the change immediately) and persist to
 *     SecureStore asynchronously in the background.
 *
 * Per the mobile security rules, the JWT is never written to
 * AsyncStorage, localStorage, cookies, or a plain file — only
 * SecureStore.
 */

const SECURE_STORE_KEY = 'auth_token';

let inMemoryToken: string | null = null;
let hasHydrated = false;

/**
 * Reads the persisted token (if any) from SecureStore into the in-memory
 * copy. Must be awaited exactly once, at startup, before any protected
 * screen or authenticated request is allowed to proceed — see
 * providers/AuthProvider.tsx, which is the only caller.
 *
 * Safe to call more than once (e.g. fast refresh during development):
 * subsequent calls are no-ops that return the already-hydrated value.
 */
export async function hydrateToken(): Promise<string | null> {
  if (hasHydrated) return inMemoryToken;
  const stored = await SecureStore.getItemAsync(SECURE_STORE_KEY);
  inMemoryToken = stored ?? null;
  hasHydrated = true;
  return inMemoryToken;
}

/**
 * Returns the current JWT, or `null` if there isn't one. Synchronous —
 * relies on `hydrateToken()` having already run. Before hydration
 * completes this always returns `null`, which is why AuthProvider holds
 * the app in a loading state until hydration finishes, rather than ever
 * treating "no token yet" as "logged out."
 */
export function getToken(): string | null {
  return inMemoryToken;
}

/** True once `hydrateToken()` has completed. */
export function isHydrated(): boolean {
  return hasHydrated;
}

/** Stores the JWT after a successful login. */
export async function setToken(token: string): Promise<void> {
  inMemoryToken = token;
  await SecureStore.setItemAsync(SECURE_STORE_KEY, token);
}

/**
 * Clears the JWT — on logout, or when the API client observes a 401.
 * Clears the in-memory copy first (synchronously) so `getToken()`
 * reflects "logged out" immediately, then removes it from SecureStore.
 */
export async function clearToken(): Promise<void> {
  inMemoryToken = null;
  await SecureStore.deleteItemAsync(SECURE_STORE_KEY);
}
