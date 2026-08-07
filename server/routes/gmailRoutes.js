const router = require("express").Router();
const jwt = require("jsonwebtoken");
const { google } = require("googleapis");
const { getOAuthClient, GMAIL_SCOPES } = require("../config/google");
const auth = require("../middleware/authMiddleware");

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// STEP 1 — Get Google auth URL
router.get("/auth-url", auth, (req, res) => {
  try {
    const oauth2Client = getOAuthClient();

    const state = jwt.sign({ id: req.user.id }, process.env.JWT_SECRET, {
      expiresIn: "10m",
    });

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
      return res.redirect(`${clientUrl}/integrations?gmail=no_refresh_token`);
    }

    // ✅ Save refresh token in DB
    await prisma.user.update({
      where: { id: decoded.id },
      data: { gmailRefreshToken: tokens.refresh_token },
    });

    res.redirect(`${clientUrl}/integrations?gmail=connected`);
  } catch (err) {
    console.error(err);
    res.redirect(`${clientUrl}/integrations?gmail=error`);
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