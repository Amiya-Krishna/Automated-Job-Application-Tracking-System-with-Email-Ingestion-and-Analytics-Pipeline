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
const { buildGmailQuery, filterJobEmails } = require("../services/emailRelevance");
const { normalizeJobUrl } = require("../services/jobUrl");

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
// The browser extension calls this as /gmail/auth-url?source=extension. The
// server signs its configured Chrome Identity redirect into OAuth state. The
// mobile app calls it as /gmail/auth-url?source=mobile&redirectUri=<its own deep link>.
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

    if (source === "extension") {
      // The extension does NOT use chrome.identity.launchWebAuthFlow().
      // Google still redirects to GOOGLE_REDIRECT_URI, then this server sends
      // the browser to its own same-origin relay page. The relay page signals
      // the extension service worker, which returns THIS SAME TAB to dashboard.html.
      const relayUrl = extensionLandingUrl();
      // Prefer the actual extension origin that made this authenticated request.
      // This prevents an unpacked/reinstalled extension from getting stuck on the
      // relay page because a stale EXTENSION_ID is still configured on Render.
      // Keep EXTENSION_ID as a fallback for environments that do not send Origin.
      const requestOrigin = String(req.get("origin") || "").trim();
      const originMatch = requestOrigin.match(/^chrome-extension:\/\/([a-p]{32})$/);
      const configuredExtensionId = String(process.env.EXTENSION_ID || "").trim();
      const extensionId = originMatch?.[1] || configuredExtensionId;
      if (!relayUrl || !/^[a-p]{32}$/.test(extensionId)) {
        return res.status(503).json({
          message: "Gmail extension OAuth is not configured on the server.",
          code: "extension_oauth_not_configured",
        });
      }
      statePayload.extensionRelayUrl = relayUrl;
      statePayload.extensionId = extensionId;
    } else if (source === "mobile") {
      const redirectUri = req.query.redirectUri;
      if (!isAllowedGmailRedirect(redirectUri)) {
        return res.status(400).json({
          message:
            "A valid redirectUri (this app's gmail-callback deep link) is required when source=mobile",
        });
      }
      statePayload.redirectUri = redirectUri;
    } else if (source === "web") {
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
//   extension -> the server's same-origin relay page, which messages the
//                extension service worker; the service worker returns the SAME tab
//                to dashboard.html.
//   mobile    -> the app's own gmail-callback deep link, consumed by the in-app auth session.
router.get("/callback", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const allowedOrigins = parseClientOrigins();
  const defaultWebOrigin = allowedOrigins[0] || "";

  function redirectTarget(status, ctx = {}) {
    const { source = "web", mobileRedirectUri, returnOrigin, returnPath } = ctx;
    if (source === "extension" && ctx.extensionRelayUrl) {
      const u = new URL(ctx.extensionRelayUrl);
      u.searchParams.set("gmail", status);
      if (/^[a-p]{32}$/.test(ctx.extensionId || "")) {
        u.searchParams.set("extensionId", ctx.extensionId);
      }
      return u.toString();
    }
    if (source === "mobile" && isAllowedGmailRedirect(mobileRedirectUri)) {
      const sep = mobileRedirectUri.includes("?") ? "&" : "?";
      return `${mobileRedirectUri}${sep}gmail=${status}`;
    }
    // Web (and the fallback for an unreadable state): re-validate against the allow-list.
    const origin = allowedOrigins.includes(returnOrigin) ? returnOrigin : defaultWebOrigin;
    const path = sanitizeReturnPath(returnPath);
    return `${origin}${path}${path.includes("?") ? "&" : "?"}gmail=${status}`;
  }

  let ctx = { source: "web" };

  try {
    const { code, state, error: oauthError } = req.query;

    if (typeof state !== "string" || !state) {
      return res.redirect(redirectTarget("error", ctx));
    }

    const decoded = jwt.verify(state, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (decoded.purpose !== "gmail_oauth" || !decoded.id) throw new Error("Invalid OAuth state");
    ctx = {
      source: decoded.source === "extension" ? "extension" : decoded.source === "mobile" ? "mobile" : "web",
      mobileRedirectUri: decoded.redirectUri,
      extensionRelayUrl: decoded.extensionRelayUrl,
      extensionId: decoded.extensionId,
      returnOrigin: decoded.returnOrigin,
      returnPath: decoded.returnPath,
    };
    if (typeof oauthError === "string" && oauthError) {
      return res.redirect(redirectTarget("error", ctx));
    }
    if (typeof code !== "string" || !code) {
      return res.redirect(redirectTarget("error", ctx));
    }

    const oauth2Client = getOAuthClient();

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return res.redirect(redirectTarget("no_refresh_token", ctx));
    }

    // ✅ Save refresh token in DB — only for the user the signed state names, and only while that
    // account still exists and is ACTIVE (this route is unauthenticated: the state token alone
    // must not let a blocked or deleted account keep connecting Gmail).
    const saved = await prisma.user.updateMany({
      where: { id: decoded.id, status: "ACTIVE" },
      data: { gmailRefreshToken: tokens.refresh_token },
    });
    if (!saved || saved.count !== 1) {
      return res.redirect(redirectTarget("error", ctx));
    }

    res.redirect(redirectTarget("connected", ctx));
  } catch (err) {
    console.error("[gmail-oauth] callback failed");
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
//
// Importing the same email twice is idempotent: the Gmail message id is the
// externalJobId, and an existing row for it is returned instead of duplicated.
router.post("/import", auth, async (req, res) => {
  try {
    const body = req.body || {};

    if (!body.company || !body.role) {
      return res.status(400).json({ message: "company and role are required" });
    }

    if (body.messageId) {
      const existing = await prisma.trackedJob.findFirst({
        where: { userId: req.user.id, sourceName: "gmail", externalJobId: String(body.messageId) },
      });
      if (existing) return res.status(200).json({ ...existing, duplicate: true });
    }

    const interviewDate =
      typeof body.interviewDate === "string" && body.interviewDate
        ? body.interviewDate.slice(0, 10)
        : body.interviewDate
          ? new Date(body.interviewDate).toISOString().slice(0, 10)
          : null;

    const job = await prisma.trackedJob.create({
      data: {
        userId: req.user.id,
        company: String(body.company).slice(0, 255),
        role: String(body.role).slice(0, 255),
        status: body.status,
        interviewDate,
        notes: body.contactEmail ? `${body.notes || ""}${body.notes ? " · " : ""}Contact: ${body.contactEmail}` : body.notes,
        applicationDate: body.applicationDate
          ? new Date(body.applicationDate)
          : new Date(),
        sourceName: "gmail",
        sourceUrl: normalizeJobUrl(body.sourceUrl),
        externalJobId: body.messageId ? String(body.messageId) : null,
        description: body.description || null,
        location: body.location || null,
      },
    });

    try {
      await bridgeTrackedJobToEngine(job);
    } catch (bridgeErr) {
      console.warn("[gmailRoutes] engine bridge failed for imported job:", bridgeErr.message);
    }

    res.status(201).json({ ...job, duplicate: false });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// SCAN GMAIL
//
// "Scan inbox" used to list anything whose subject merely contained a word
// like "application" or "offer" - newsletters, promotions, OTPs and
// notifications included. Now:
//   1. Gmail itself does the first cut (see emailRelevance.buildGmailQuery):
//      promotions/social/forums/spam are excluded and only job-signal subjects
//      or known recruiting senders are listed, so most of the mailbox is never
//      even fetched.
//   2. Only message METADATA is fetched (no bodies), in small batches.
//   3. classifyEmail() scores subject / sender / labels / bulk-mail headers and
//      drops anything that is not about a specific application; threads and
//      repeats collapse to one entry; emails already imported are skipped.
// The response keeps its original shape (`messages` with id/subject/from/date/
// snippet) and adds the extracted company/role/status/contactEmail plus `stats`.
const SCAN_HEADERS = ["Subject", "From", "Date", "Reply-To", "List-Unsubscribe", "Precedence"];
const SCAN_BATCH = 10;

router.get("/scan", auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user?.gmailRefreshToken) {
      return res.status(400).json({ message: "Gmail is not connected" });
    }

    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 50);

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({ refresh_token: user.gmailRefreshToken });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const list = await gmail.users.messages.list({
      userId: "me",
      q: buildGmailQuery({ days }),
      // headroom: some listed mail is dropped by the local relevance pass
      maxResults: Math.min(limit * 2, 100),
    });

    const listed = list.data.messages || [];
    const details = [];
    for (let i = 0; i < listed.length; i += SCAN_BATCH) {
      const chunk = await Promise.all(
        listed.slice(i, i + SCAN_BATCH).map(async (msg) => {
          try {
            const full = await gmail.users.messages.get({
              userId: "me",
              id: msg.id,
              format: "metadata",
              metadataHeaders: SCAN_HEADERS,
            });
            const headers = {};
            for (const h of full.data.payload?.headers || []) headers[String(h.name).toLowerCase()] = h.value;
            return {
              id: msg.id,
              threadId: full.data.threadId || msg.threadId || null,
              subject: headers.subject || "",
              from: headers.from || "",
              date: headers.date || "",
              snippet: full.data.snippet || "",
              labelIds: full.data.labelIds || [],
              headers,
            };
          } catch (e) {
            // one unreadable message must not fail the whole scan
            return null;
          }
        }),
      );
      details.push(...chunk.filter(Boolean));
    }

    const importedRows = details.length
      ? await prisma.trackedJob.findMany({
          where: { userId: req.user.id, sourceName: "gmail", externalJobId: { in: details.map((d) => d.id) } },
          select: { externalJobId: true },
        })
      : [];
    const { messages, stats } = filterJobEmails(details, {
      importedIds: new Set(importedRows.map((r) => r.externalJobId)),
    });

    // Return only what the client needs: raw header maps / label ids stay server-side.
    const out = messages.slice(0, limit).map(({ headers, labelIds, threadId, ...rest }) => rest);
    res.json({ messages: out, stats });
  } catch (err) {
    console.error("[gmail] inbox scan failed");
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
