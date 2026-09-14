import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { disconnectGmail, getGmailAuthUrl, scanGmailInbox } from '@/services/gmail';

/**
 * Result of the connect flow, reported back to the caller so the UI can
 * show the right message (mirrors the web client's Integrations.jsx
 * toasts for the same three outcomes — see gmailRoutes.js's callback).
 * `cancelled` covers the user dismissing the browser sheet themselves,
 * which isn't an error.
 */
export type GmailConnectOutcome =
  | 'connected'
  | 'no_refresh_token'
  | 'error'
  | 'cancelled';

/**
 * Native (non-WebView) Gmail OAuth connect flow, per Phase-3 rules:
 *   1. Build this app's own redirect deep link with Linking.createURL().
 *      This resolves correctly whether the app is running in Expo Go
 *      (an `exp://<lan-ip>:8081/--/...` URL, different per machine) or a
 *      standalone/dev-client build (the fixed `mobile://` scheme from
 *      app.json) — see services/gmail.ts for why this can't just be a
 *      fixed backend env var the way the browser extension's redirect is.
 *   2. Ask the backend for the Google consent-screen URL, passing that
 *      redirect URI (server/routes/gmailRoutes.js signs it into `state`
 *      and validates the scheme).
 *   3. Open it with WebBrowser.openAuthSessionAsync — an OS-level
 *      authentication session (ASWebAuthenticationSession on iOS, Custom
 *      Tabs on Android), never a WebView — which resolves once Google
 *      redirects back to our deep link.
 *   4. Read the `gmail` status query param off the result URL and
 *      invalidate the cached Gmail status so the Profile screen refetches.
 */
export function useConnectGmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<GmailConnectOutcome> => {
      const redirectUri = Linking.createURL('gmail-callback');
      const { url } = await getGmailAuthUrl(redirectUri);

      const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);

      if (result.type !== 'success' || !result.url) {
        return 'cancelled';
      }

      const status = Linking.parse(result.url).queryParams?.gmail;
      if (status === 'connected' || status === 'no_refresh_token') {
        return status;
      }
      return 'error';
    },
    onSuccess: (outcome) => {
      if (outcome === 'connected') {
        return queryClient.invalidateQueries({ queryKey: ['gmail'] });
      }
    },
  });
}

export function useDisconnectGmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: disconnectGmail,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gmail'] }),
  });
}

/**
 * Not a useQuery: scanning is a deliberate, on-demand user action (a
 * button press), not something that should ever run automatically on
 * mount/focus/refetch the way the rest of the app's queries do — matches
 * the web client's Integrations.jsx, which only scans on click.
 */
export function useScanGmail() {
  // Errors surface via the returned mutation's `.error` (an ApiError with
  // a user-safe message — see services/api.ts) — no onError needed here.
  return useMutation({
    mutationFn: scanGmailInbox,
  });
}
