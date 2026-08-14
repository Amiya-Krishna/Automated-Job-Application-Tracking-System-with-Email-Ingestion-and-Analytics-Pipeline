const router = require("express").Router();
const jwt = require("jsonwebtoken");
const { google } = require("googleapis");
const { getOAuthClient, GMAIL_SCOPES } = require("../config/google");
const auth = require("../middleware/authMiddleware");

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// STEP 1 — Get Google auth URL
// The browser extension calls this as /gmail/auth-url?source=extension so
// the callback below knows to send the browser back to the extension's own
// dashboard instead of the Vercel-hosted web client.
router.get("/auth-url", auth, (req, res) => {
  try {
    const oauth2Client = getOAuthClient();

    const source = req.query.source === "extension" ? "extension" : "web";

    const state = jwt.sign(
      { id: req.user.id, source },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: GMAIL_SCOPES,
      state,
    });

    res.json({ url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// STEP 2 — Callback
// EXTENSION_REDIRECT_URL is a separate redirect target (set in server/.env)
// used only when the OAuth flow was started from the browser extension
// (source=extension). It should point at the extension's own dashboard
// page, e.g. chrome-extension://<your-extension-id>/dashboard.html — open
// chrome://extensions with Developer mode on to find your extension's ID.
// If it isn't set, we fall back to a small page served by this same
// server (see /extension/gmail-success.html below) so the flow still
// completes instead of dumping the user on the web client by mistake.
router.get("/callback", async (req, res) => {
  const clientUrl = (process.env.CLIENT_URL || "").split(",")[0] || "/";
  const extensionRedirectUrl =
    process.env.EXTENSION_REDIRECT_URL ||
    `${(process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, "")}/extension/gmail-success.html`;

  function redirectTarget(status, source) {
    if (source === "extension") {
      const sep = extensionRedirectUrl.includes("?") ? "&" : "?";
      return `${extensionRedirectUrl}${sep}gmail=${status}`;
    }
    return `${clientUrl}/integrations?gmail=${status}`;
  }

  let source = "web";

  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.redirect(redirectTarget("error", source));
    }

    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    source = decoded.source === "extension" ? "extension" : "web";
    const oauth2Client = getOAuthClient();

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return res.redirect(redirectTarget("no_refresh_token", source));
    }

    // ✅ Save refresh token in DB
    await prisma.user.update({
      where: { id: decoded.id },
      data: { gmailRefreshToken: tokens.refresh_token },
    });

    res.redirect(redirectTarget("connected", source));
  } catch (err) {
    console.error(err);
    res.redirect(redirectTarget("error", source));
  }
});

// STATUS
router.get("/status", auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    res.json({ connected: Boolean(user?.gmailRefreshToken) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DISCONNECT
router.post("/disconnect", auth, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { gmailRefreshToken: null },
    });

    res.json({ message: "Gmail disconnected" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// IMPORT JOB FROM EMAIL
router.post("/import", auth, async (req, res) => {
  try {
    const job = await prisma.trackedJob.create({
      data: {
        userId: req.user.id,
        company: req.body.company,
        role: req.body.role,
        status: req.body.status,
        interviewDate: req.body.interviewDate
          ? new Date(req.body.interviewDate)
          : null,
        notes: req.body.notes,
        applicationDate: req.body.applicationDate
          ? new Date(req.body.applicationDate)
          : new Date(),
        duplicateStrategy: req.body.duplicateStrategy,
      },
    });

    res.status(201).json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// SCAN GMAIL
router.get("/scan", auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

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