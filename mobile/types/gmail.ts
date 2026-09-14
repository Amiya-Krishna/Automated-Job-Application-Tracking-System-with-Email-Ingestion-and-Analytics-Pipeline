/**
 * GET /api/gmail/status -> { connected: boolean }
 *
 * Matches server/routes/gmailRoutes.js exactly. Note there is no
 * "last synchronized" timestamp anywhere in this response or the
 * `users` table — flagged during the Step-1 analysis as a genuinely
 * missing backend field, not something to fabricate here.
 */
export interface GmailStatus {
  connected: boolean;
}

/**
 * GET /api/gmail/auth-url?source=mobile&redirectUri=... -> { url: string }
 *
 * `url` is the Google consent-screen URL to open in a browser (never a
 * WebView — see services/gmail.ts). Matches gmailRoutes.js exactly.
 */
export interface GmailAuthUrl {
  url: string;
}

/**
 * GET /api/gmail/scan -> { messages: GmailScanMessage[] }
 *
 * Matches gmailRoutes.js's `/scan` route exactly: metadata only (subject,
 * from, date, snippet) — the backend never returns full email bodies.
 */
export interface GmailScanMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

/**
 * Output of utils/emailParser.ts's parseJobEmail(), ported from the web
 * client's client/src/utils/emailParser.js. Purely a client-side best-
 * effort heuristic over a GmailScanMessage's subject/snippet — never
 * sent to or computed by the backend, so every field stays editable
 * before the user saves it as a tracked application.
 */
export interface ParsedJobEmail {
  company: string;
  role: string;
  status: string;
  interviewDate: string;
  matched: boolean;
}

export interface GmailScanResult extends GmailScanMessage {
  parsed: ParsedJobEmail;
}
