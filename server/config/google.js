const { google } = require("googleapis");

function getOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error(
      "Gmail integration isn't configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in server/.env."
    );
  }

  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

// Read-only scope — this app only ever lists/reads messages, never sends
// or deletes anything in the user's inbox.
const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

module.exports = { getOAuthClient, GMAIL_SCOPES };
