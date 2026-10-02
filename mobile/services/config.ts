/**
 * The ONE place environment configuration is read.
 *
 * `process.env.EXPO_PUBLIC_*` must be referenced statically (no dynamic keys) or
 * Metro cannot inline the value. Only public, non-secret values belong here:
 * never a JWT secret, API key or signing credential.
 *
 * Deliberately free of React Native / Expo imports so it (and the API client
 * built on it) can run under plain Node for tests.
 */
export type AppEnv = 'development' | 'staging' | 'production';

const rawEnv = process.env.EXPO_PUBLIC_APP_ENV;
export const APP_ENV: AppEnv = rawEnv === 'production' || rawEnv === 'staging' ? rawEnv : 'development';
export const IS_PRODUCTION = APP_ENV === 'production';
export const IS_RELEASE_ENV = APP_ENV !== 'development';
export const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

const stripSlash = (v: string | undefined) => (v ?? '').trim().replace(/\/+$/, '');

const DEPLOYED_API_ORIGIN = 'https://job-application-tracker-portal-o1ls.onrender.com';

// Release OTA updates must never lose the backend just because an EAS update
// was published without re-inlining EXPO_PUBLIC_API_URL. The environment
// variable remains the source of truth when present; the known deployed API
// is a safe fallback for this app's staging/production release.
export const API_ORIGIN = stripSlash(process.env.EXPO_PUBLIC_API_URL) ||
  (IS_RELEASE_ENV ? DEPLOYED_API_ORIGIN : '');
export const API_BASE_URL = `${API_ORIGIN}/api`;
export const WEB_URL = stripSlash(process.env.EXPO_PUBLIC_WEB_URL);
export const SENTRY_DSN = (process.env.EXPO_PUBLIC_SENTRY_DSN ?? '').trim();
export const SUPPORT_EMAIL = (process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '').trim();

const timeout = Number(process.env.EXPO_PUBLIC_API_TIMEOUT_MS);
// 45s default: a Render free-tier service can take 30-60s to wake from idle.
export const API_TIMEOUT_MS = Number.isFinite(timeout) && timeout >= 5000 ? timeout : 45000;

/** Release builds must talk to the API over HTTPS. Development may use http:// (emulator / LAN). */
export function isSecureApiUrl(origin: string, env: AppEnv = APP_ENV): boolean {
  if (!origin) return false;
  if (/^https:\/\//i.test(origin)) return true;
  return env === 'development' && /^http:\/\//i.test(origin);
}
export const API_CONFIG_OK = isSecureApiUrl(API_ORIGIN);

// Public legal / data-deletion pages. Default to the ones the backend serves
// from server/public/legal so a fresh deployment works with no extra hosting.
export const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL?.trim() || (API_ORIGIN ? `${API_ORIGIN}/legal/privacy.html` : '');
export const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL?.trim() || (API_ORIGIN ? `${API_ORIGIN}/legal/terms.html` : '');
export const DELETE_ACCOUNT_URL =
  process.env.EXPO_PUBLIC_DELETE_ACCOUNT_URL?.trim() || (API_ORIGIN ? `${API_ORIGIN}/legal/delete-account.html` : '');

// Set once at startup from native modules (see app/_layout.tsx) so this file
// stays native-free.
interface AppInfo {
  version: string;
  platform: string;
  deviceName: string | null;
}
let appInfo: AppInfo = { version: 'unknown', platform: 'unknown', deviceName: null };
export const setAppInfo = (info: Partial<AppInfo>) => {
  appInfo = { ...appInfo, ...info };
};
export const getAppInfo = (): AppInfo => appInfo;
