const router = require("express").Router();
const jwt = require("jsonwebtoken");
const { google } = require("googleapis");
const { getOAuthClient, GMAIL_SCOPES } = require("../config/google");
const auth = require("../middleware/authMiddleware");
const { bridgeTrackedJobToEngine } = require("../services/engineBridge");
const {
  parseClientOrigins,
  resolveWebReturnOrigin,
  sanitizeReturnPath,
  withParam,
  isAllowedGmailRedirect,
  extensionLandingUrl,
} = require("../utils/oauthReturn");

const prisma = require("../lib/prisma");

// MOBILE OAUTH (Phase 3 addition): unlike the browser extension, there is
// no single fixed redirect URL for mobile — a standalone/dev-client build
// uses the stable `mobile://` scheme from mobile/app.json, but Expo Go
// uses a per-machine `exp://<lan-ip>:8081/--/...` URL that can't be baked
// into a server .env var. So instead of a static *_REDIRECT_URL like the
// extension's, the mobile client computes its own redirect URI
// (Linking.createURL(...)) and sends it with the auth-url request; it
// rides inside the signed `state` JWT (server-issued and verified on the
// way back, so it can't be tampered with in transit) and is restricted to
// the `mobile://` / `exp://` schemes (see ../utils/mobileRedirect.js —
// shared with password reset's forgot-password route, same trust model)
// so `state` can't be abused as an open redirect to an arbitrary domain.

// STEP 1 — Get Google auth URL
// The browser extension calls this as /gmail/auth-url?source=extension so
// the callback below knows to send the browser back to the extension's own
// dashboard instead of the Vercel-hosted web client. The mobile app calls
// it as /gmail/auth-url?source=mobile&redirectUri=<its own deep link>.
router.get("/auth-url", auth, (req, res) => {
  try {
    const oauth2Client = getOAuthClient();

    const source =
      req.query.source === "extension"
        ? "extension"
        : req.query.source === "mobile"
        ? "mobile"
        : "web";

    // `purpose` keeps this state token from ever being accepted as a login token.
    // The state is the ONLY thing the callback trusts about who started the flow
    // and where to send them back, so everything it carries is validated here.
    // It also records the initiating session (`sid`) for traceability; the
    // callback never creates, rotates or revokes a login session.
    const statePayload = { id: req.user.id, sid: req.user.sid, source, purpose: "gmail_oauth" };

    if (source === "mobile") {
      const redirectUri = req.query.redirectUri;
      if (!isAllowedGmailRedirect(redirectUri)) {
        return res.status(400).json({
          message:
            "A valid redirectUri (this app's gmail-callback deep link) is required when source=mobile",
        });
      }
      statePayload.redirectUri = redirectUri;
    } else if (source === "web") {
      statePayload.popup = req.query.popup === "1";
      // Return to the origin that started the flow (not "whichever CLIENT_URL
      // entry is first") and to the page the button was clicked on.
      statePayload.returnOrigin = resolveWebReturnOrigin(req.get("origin"));
      statePayload.returnPath = sanitizeReturnPath(req.query.returnTo);
    }

    const state = jwt.sign(statePayload, process.env.JWT_SECRET, {
      algorithm: "HS256",
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
// Google sends the browser here as a top-level navigation, so there are no TrackTrail
// cookies/headers to read: everything about the flow comes from the signed `state`.
// This route only stores the Gmail refresh token for the user named in `state`; it never
// creates, rotates or revokes a TrackTrail login session and never sets cookies, so the
// session the client already has stays exactly as it was.
//
// Where it returns to:
//   web       -> <origin that started the flow><page that started it>?gmail=<status>
//   extension -> a page on this server (extensionLandingUrl); the extension's service
//                worker watches for it, closes the tab and refocuses the dashboard.
//                (A redirect to chrome-extension://... is blocked by Chrome.)
//   mobile    -> the app's own gmail-callback deep link, consumed by the in-app auth session.
router.get("/callback", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const allowedOrigins = parseClientOrigins();
  const defaultWebOrigin = allowedOrigins[0] || "";

  function redirectTarget(status, ctx = {}) {
    const { source = "web", mobileRedirectUri, returnOrigin, returnPath } = ctx;
    if (source === "extension") return withParam(extensionLandingUrl(), "gmail", status);
    if (source === "mobile" && isAllowedGmailRedirect(mobileRedirectUri)) {
      const sep = mobileRedirectUri.includes("?") ? "&" : "?";
      return `${mobileRedirectUri}${sep}gmail=${status}`;
    }
    // Web (and the fallback for an unreadable state): re-validate against the allow-list.
    const origin = allowedOrigins.includes(returnOrigin) ? returnOrigin : defaultWebOrigin;
    const path = sanitizeReturnPath(returnPath);
    return `${origin}${path}${path.includes("?") ? "&" : "?"}gmail=${status}`;
  }

  function renderWebPopup(status, ctx = {}) {
    const origin = allowedOrigins.includes(ctx.returnOrigin)
      ? ctx.returnOrigin
      : defaultWebOrigin;
    const path = sanitizeReturnPath(ctx.returnPath);
    const returnUrl = `${origin}${path}${path.includes("?") ? "&" : "?"}gmail=${status}`;

    // These values are server-generated and origin/path validated above. Escape
    // '<' before embedding JSON in a script so even a deliberately crafted path
    // cannot terminate the script element. No login/session token is exposed.
    const payload = JSON.stringify({
      type: "tracktrail:gmail-oauth",
      status,
    }).replace(/</g, "\\u003c");
    const targetOrigin = JSON.stringify(origin).replace(/</g, "\\u003c");
    const fallbackUrl = JSON.stringify(returnUrl).replace(/</g, "\\u003c");

    res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="referrer" content="no-referrer">
    <meta name="robots" content="noindex,nofollow">
    <title>TrackTrail — Gmail</title>
  </head>
  <body>
    <p>Gmail connection finished. You can close this window.</p>
    <script>
      (() => {
        const message = ${payload};
        const targetOrigin = ${targetOrigin};
        const fallbackUrl = ${fallbackUrl};

        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(message, targetOrigin);
          setTimeout(() => window.close(), 150);
          return;
        }

        // If the popup was detached or opened without an opener, preserve the
        // old web fallback instead of leaving the user on a blank page.
        window.location.replace(fallbackUrl);
      })();
    </script>
  </body>
</html>`);
  }

  let ctx = { source: "web", popup: false };

  try {
    const { code, state, error: googleError } = req.query;

    // Google can return an OAuth denial with `state` but without `code`. Decode
    // the signed state first so popup flows can report that failure to the
    // still-open parent window instead of falling back to a full-page redirect.
    if (typeof state !== "string" || !state) {
      return res.redirect(redirectTarget("error", ctx));
    }

    const decoded = jwt.verify(state, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (decoded.purpose !== "gmail_oauth" || !decoded.id) throw new Error("Invalid OAuth state");
    ctx = {
      source: decoded.source === "extension" ? "extension" : decoded.source === "mobile" ? "mobile" : "web",
      mobileRedirectUri: decoded.redirectUri,
      returnOrigin: decoded.returnOrigin,
      returnPath: decoded.returnPath,
      popup: decoded.source === "web" && decoded.popup === true,
    };

    if (googleError || typeof code !== "string" || !code) {
      if (ctx.source === "web" && ctx.popup) return renderWebPopup("error", ctx);
      return res.redirect(redirectTarget("error", ctx));
    }

    const oauth2Client = getOAuthClient();

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      if (ctx.source === "web" && ctx.popup) return renderWebPopup("no_refresh_token", ctx);
      return res.redirect(redirectTarget("no_refresh_token", ctx));
    }

    // ✅ Save refresh token in DB — only for the user the signed state names.
    await prisma.user.update({
      where: { id: decoded.id },
      data: { gmailRefreshToken: tokens.refresh_token },
    });

    if (ctx.source === "web" && ctx.popup) return renderWebPopup("connected", ctx);
    res.redirect(redirectTarget("connected", ctx));
  } catch (err) {
    console.error("[gmail-oauth] callback failed");
    if (ctx.source === "web" && ctx.popup) return renderWebPopup("error", ctx);
    res.redirect(redirectTarget("error", ctx));
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
//
// Previously wrote straight to tracked_jobs and stopped there — the job
// never reached the engine (engineBridge/ingestQueue/matching), so
// Gmail-imported jobs never got a match score and never showed up in
// Matched Jobs. Fixed to go through the same bridge every other source
// uses, tagged with sourceName "gmail" so it's attributable in the
// unified Applied Jobs / Sources views.
//
// Emails rarely carry a real job description or posting URL, so most
// Gmail imports will legitimately fail hasEnoughDataToBridge() and stay
// tracked-only until the user fills in a description by hand (the same
// re-bridge-on-update path jobRoutes.js already uses covers that case).
// That's intentional — see the audit note in engineBridge.js about not
// polluting the corpus with empty-description rows.
router.post("/import", auth, async (req, res) => {
  try {
    const body = req.body || {};

    if (!body.company || !body.role) {
      return res.status(400).json({ message: "company and role are required" });
    }

    const job = await prisma.trackedJob.create({
      data: {
        userId: req.user.id,
        company: body.company,
        role: body.role,
        status: body.status,
        interviewDate: body.interviewDate ? new Date(body.interviewDate) : null,
        notes: body.notes,
        applicationDate: body.applicationDate
          ? new Date(body.applicationDate)
          : new Date(),
        sourceName: "gmail",
        sourceUrl: body.sourceUrl || null,
        externalJobId: body.messageId || null,
        description: body.description || null,
        location: body.location || null,
      },
    });

    try {
      await bridgeTrackedJobToEngine(job);
    } catch (bridgeErr) {
      console.warn("[gmailRoutes] engine bridge failed for imported job:", bridgeErr.message);
    }

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
    console.error("[gmail] inbox scan failed");
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
