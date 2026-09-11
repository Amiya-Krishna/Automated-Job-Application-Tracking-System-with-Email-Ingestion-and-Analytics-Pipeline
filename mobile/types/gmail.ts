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
