/**
 * Deep-link + notification-target resolution. Pure (no React Native imports) so
 * it is unit-tested end to end.
 *
 * Every entry point (custom scheme, verified https App Link, notification tap)
 * funnels through here and is checked against an ALLOW-LIST of in-app routes.
 * Anything else resolves to null and is ignored — a link or push payload can
 * never navigate somewhere the app did not intend, nor inject arbitrary params.
 */
export type LinkResult =
  | { kind: 'public'; href: string }
  | { kind: 'protected'; href: string }
  | { kind: 'ignore' }
  | { kind: 'unknown' };

const ID = /^\d{1,12}$/;
const RESET_TOKEN = /^[A-Za-z0-9._-]{20,2000}$/;
const APP_SCHEMES = new Set(['tracktrail:', 'mobile:']); // `mobile:` = builds before the rename

/** Splits any supported URL into a normalized path ("/application/5") and its query. */
export function parseIncoming(raw: string): { path: string; query: URLSearchParams } | null {
  if (typeof raw !== 'string' || raw.length > 4000) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Router-style relative path such as "/application/5?x=1".
    if (!raw.startsWith('/')) return null;
    try {
      url = new URL(raw, 'https://placeholder.invalid');
    } catch {
      return null;
    }
    return { path: normalize(url.pathname), query: url.searchParams };
  }

  let path: string;
  if (APP_SCHEMES.has(url.protocol)) {
    // tracktrail://application/5  -> host "application", pathname "/5"
    path = `/${url.host}${url.pathname}`;
  } else if (url.protocol === 'exp:' || url.protocol === 'exps:') {
    // Expo Go: exp://192.168.1.5:8081/--/application/5
    const i = url.pathname.indexOf('/--/');
    path = i >= 0 ? url.pathname.slice(i + 3) : '/';
  } else if (url.protocol === 'https:') {
    // Verified App Link: https://api.example.com/app/application/5 (only the /app prefix is ours)
    if (!url.pathname.startsWith('/app/') && url.pathname !== '/app') return null;
    path = url.pathname.slice(4) || '/';
  } else {
    return null;
  }
  return { path: normalize(path), query: url.searchParams };
}

function normalize(p: string): string {
  const cleaned = p.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return cleaned === '' ? '/' : cleaned;
}

/** Resolves an incoming URL to an in-app href, or says to ignore/unknown. */
export function resolveDeepLink(raw: string): LinkResult {
  const parsed = parseIncoming(raw);
  if (!parsed) return { kind: 'unknown' };
  const { path, query } = parsed;

  if (path === '/reset-password') {
    const token = query.get('token');
    // No token -> still open the screen (manual code entry); a malformed token is dropped, not forwarded.
    return { kind: 'public', href: token && RESET_TOKEN.test(token) ? `/reset-password?token=${encodeURIComponent(token)}` : '/reset-password' };
  }
  if (path === '/gmail-callback') return { kind: 'ignore' }; // consumed by WebBrowser.openAuthSessionAsync

  let m: RegExpExecArray | null;
  if ((m = /^\/application\/(\d+)$/.exec(path)) && ID.test(m[1])) return { kind: 'protected', href: `/application/${m[1]}` };
  if ((m = /^\/job\/(\d+)$/.exec(path)) && ID.test(m[1])) return { kind: 'protected', href: `/job/${m[1]}` };
  if (path === '/tailor') {
    const v = query.get('versionId');
    return { kind: 'protected', href: v && ID.test(v) ? `/tailor?versionId=${v}` : '/tailor' };
  }
  const STATIC = ['/', '/jobs', '/applications', '/notifications', '/analytics', '/resumes', '/account/gmail', '/account/settings', '/saved-jobs'];
  if (STATIC.includes(path)) return path === '/' ? { kind: 'public', href: '/' } : { kind: 'protected', href: path };
  return { kind: 'unknown' };
}

/**
 * Validates a push-notification `data.target` ({ pathname, params }) coming from
 * the server (or a local notification) and turns it into a safe href.
 */
export function resolveNotificationTarget(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const target = (data as { target?: unknown }).target;
  if (!target || typeof target !== 'object') return null;
  const { pathname, params } = target as { pathname?: unknown; params?: unknown };
  if (typeof pathname !== 'string') return null;
  const p = params && typeof params === 'object' ? (params as Record<string, unknown>) : {};
  const str = (k: string) => (typeof p[k] === 'string' || typeof p[k] === 'number' ? String(p[k]) : '');

  switch (pathname) {
    case '/application/[id]':
      return ID.test(str('id')) ? `/application/${str('id')}` : '/applications';
    case '/job/[id]':
      return ID.test(str('id')) ? `/job/${str('id')}` : '/jobs';
    case '/tailor':
      return ID.test(str('versionId')) ? `/tailor?versionId=${str('versionId')}` : '/tailor';
    case '/jobs':
    case '/applications':
    case '/notifications':
    case '/resumes':
      return pathname;
    default:
      return null;
  }
}
