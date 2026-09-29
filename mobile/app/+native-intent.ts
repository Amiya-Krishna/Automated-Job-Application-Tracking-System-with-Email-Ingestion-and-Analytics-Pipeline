/**
 * Runs for EVERY incoming deep link (custom scheme, verified https App Link,
 * Expo Go) before Expo Router navigates. It is the single choke point that
 * makes deep links safe and correct:
 *
 *  - reset-password  -> always opens the public screen (works signed in or out)
 *  - gmail-callback  -> never becomes a route (WebBrowser consumes it); the user
 *                       stays on / returns to the Gmail screen instead of a 404
 *  - protected links -> if signed out, remembered and opened right after sign-in
 *  - anything else   -> "/" (no unmatched-route screens from stray links)
 */
import { resolveDeepLink } from '@/utils/deep-links';
import { setPendingLink } from '@/services/pendingLink';
import { getRefreshToken, getToken, hydrateSession } from '@/services/tokenStore';

export async function redirectSystemPath({ path }: { path: string; initial: boolean }): Promise<string> {
  try {
    const result = resolveDeepLink(path);
    switch (result.kind) {
      case 'public':
        return result.href;
      case 'ignore':
        return '/account/gmail';
      case 'protected': {
        await hydrateSession();
        if (getToken() || getRefreshToken()) return result.href;
        setPendingLink(result.href);
        return '/';
      }
      default:
        return '/';
    }
  } catch {
    return '/';
  }
}
