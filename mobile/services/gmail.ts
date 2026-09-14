import { api } from '@/services/api';
import type { GmailAuthUrl, GmailScanMessage, GmailStatus } from '@/types/gmail';

export async function getGmailStatus(): Promise<GmailStatus> {
  const { data } = await api.get<GmailStatus>('/gmail/status');
  return data;
}

/**
 * GET /api/gmail/auth-url?source=mobile&redirectUri=...
 *
 * `redirectUri` must be this app's own deep link (built with
 * `Linking.createURL(...)` in hooks/use-gmail.ts, NOT hardcoded) — the
 * backend only accepts `mobile://` / `exp://` schemes for source=mobile
 * and 400s otherwise (see server/routes/gmailRoutes.js's
 * isAllowedMobileRedirect). It rides inside the signed `state` JWT and
 * comes back verbatim as the final redirect target after Google's
 * consent screen.
 */
export async function getGmailAuthUrl(redirectUri: string): Promise<GmailAuthUrl> {
  const { data } = await api.get<GmailAuthUrl>('/gmail/auth-url', {
    params: { source: 'mobile', redirectUri },
  });
  return data;
}

export async function disconnectGmail(): Promise<void> {
  await api.post('/gmail/disconnect');
}

/**
 * GET /api/gmail/scan -> { messages: GmailScanMessage[] }
 *
 * Metadata-only (subject/from/date/snippet) over the last 30 days —
 * matches gmailRoutes.js exactly. Parsing the results into a candidate
 * application happens client-side (utils/email-parser.ts), same as the
 * web client.
 */
export async function scanGmailInbox(): Promise<GmailScanMessage[]> {
  const { data } = await api.get<{ messages: GmailScanMessage[] }>('/gmail/scan');
  return data.messages;
}
