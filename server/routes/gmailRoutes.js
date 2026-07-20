const router = require("express").Router();
const jwt = require("jsonwebtoken");
const { google } = require("googleapis");
const { getOAuthClient, GMAIL_SCOPES } = require("../config/google");
const User = require("../models/User");
const auth = require("../middleware/authMiddleware");

// STEP 1 — logged-in user asks for a Google consent URL.
// We sign a short-lived state token carrying their user id, since the
// redirect back from Google (step 2) is a plain browser navigation with
// no Authorization header we can otherwise tie to a user.
router.get("/auth-url", auth, (req, res) => {
  try {
    const oauth2Client = getOAuthClient();

    const state = jwt.sign({ id: req.user.id }, process.env.JWT_SECRET, {
      expiresIn: "10m",
    });

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent", // forces a refresh_token on every connect, not just the first
      scope: GMAIL_SCOPES,
      state,
    });

    res.json({ url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// STEP 2 — Google redirects the browser here after the user approves access.
router.get("/callback", async (req, res) => {
  const clientUrl = (process.env.CLIENT_URL || "").split(",")[0] || "/";

  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.redirect(`${clientUrl}/integrations?gmail=error`);
    }

    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    const oauth2Client = getOAuthClient();

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      // Happens if the user had already granted access before and Google
      // didn't issue a new refresh token. Ask them to revoke access at
      // https://myaccount.google.com/permissions and try again.
      return res.redirect(`${clientUrl}/integrations?gmail=no_refresh_token`);
    }

    await User.setGmailRefreshToken(decoded.id, tokens.refresh_token);

    res.redirect(`${clientUrl}/integrations?gmail=connected`);
  } catch (err) {
    console.error(err);
    res.redirect(`${clientUrl}/integrations?gmail=error`);
  }
});

// Is Gmail connected for the current user?
router.get("/status", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({ connected: Boolean(user && user.gmailRefreshToken) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/disconnect", auth, async (req, res) => {
  try {
    await User.setGmailRefreshToken(req.user.id, null);
    res.json({ message: "Gmail disconnected" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Scan the inbox for recent messages that look interview/offer/rejection
// related and hand back subject + snippet + sender + date. Parsing that
// into company/role/status happens on the frontend (same heuristics used
// for the "paste an email" feature), so this endpoint stays lightweight
// and never stores email content.
router.get("/scan", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user?.gmailRefreshToken) {
      return res.status(400).json({ message: "Gmail is not connected" });
    }

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({ refresh_token: user.gmailRefreshToken });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const query =
      'newer_than:30d (subject:interview OR subject:application OR subject:offer OR "moving forward" OR "not selected")';

    const list = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 15,
    });

    const messages = list.data.messages || [];

    const details = await Promise.all(
      messages.map(async (msg) => {
        const full = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "Date"],
        });

        const headers = full.data.payload?.headers || [];
        const getHeader = (name) =>
          headers.find((h) => h.name === name)?.value || "";

        return {
          id: msg.id,
          subject: getHeader("Subject"),
          from: getHeader("From"),
          date: getHeader("Date"),
          snippet: full.data.snippet || "",
        };
      })
    );

    res.json({ messages: details });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
