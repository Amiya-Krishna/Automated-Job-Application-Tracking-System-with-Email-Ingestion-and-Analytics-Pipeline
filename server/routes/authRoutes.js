const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendPasswordResetEmail } = require("../services/emailService");
const { isAllowedResetRedirect } = require("../utils/mobileRedirect");
const authMiddleware = require("../middleware/authMiddleware");
const { createRateLimiter } = require("../middleware/rateLimit");
const sessions = require("../lib/sessions");

const { Prisma } = require("@prisma/client");
const prisma = require("../lib/prisma");

// Brute-force / abuse protection (per client IP; per-instance memory).
const loginLimiter = createRateLimiter({ name: "auth-login", windowMs: 15 * 60 * 1000, max: Number(process.env.RL_LOGIN_MAX) || 20 });
const registerLimiter = createRateLimiter({ name: "auth-register", windowMs: 60 * 60 * 1000, max: Number(process.env.RL_REGISTER_MAX) || 15 });
const forgotLimiter = createRateLimiter({ name: "auth-forgot", windowMs: 60 * 60 * 1000, max: Number(process.env.RL_FORGOT_MAX) || 8 });
const resetLimiter = createRateLimiter({ name: "auth-reset", windowMs: 60 * 60 * 1000, max: Number(process.env.RL_RESET_MAX) || 30 });
const refreshLimiter = createRateLimiter({ name: "auth-refresh", windowMs: 15 * 60 * 1000, max: Number(process.env.RL_REFRESH_MAX) || 120 });
const deleteLimiter = createRateLimiter({ name: "auth-delete", windowMs: 60 * 60 * 1000, max: 5 });

// Mobile opts in to rotating tokens in its JSON response. Web uses the same
// session rows, but its refresh token stays in an HttpOnly cookie. The
// extension retains its legacy header-token contract.
function isMobileClient(req) {
  const h = String(req.header("x-client") || "").toLowerCase();
  return h === "mobile" || (req.body && req.body.client === "mobile");
}
function isExtensionClient(req) { return String(req.header("x-client") || "").toLowerCase() === "extension"; }
function isWebClient(req) { return String(req.header("x-client") || "").toLowerCase() === "web"; }
function readCookie(req, name) {
  const match = String(req.headers.cookie || "").split(/;\s*/).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}
function refreshCookieOptions(req, rememberMe = true) {
  // The web client is hosted separately from the API (for example Vercel ->
  // Render). In that deployment the refresh cookie is cross-site and therefore
  // must be Secure + SameSite=None. Render terminates TLS at its proxy, so use
  // req.secure as well as NODE_ENV instead of relying on NODE_ENV alone.
  const production = process.env.NODE_ENV === "production";
  const forwardedProto = String(req.get("x-forwarded-proto") || "").split(",")[0].trim().toLowerCase();
  const secure = production || req.secure === true || forwardedProto === "https";
  const options = {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    path: "/api/auth",
  };
  if (rememberMe) options.maxAge = (Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 60) * 86400 * 1000;
  return options;
}
function setWebRefreshCookie(req, res, refreshToken, rememberMe = true) { res.cookie("tt_refresh", refreshToken, refreshCookieOptions(req, rememberMe)); }
function clearWebRefreshCookie(req, res) { res.clearCookie("tt_refresh", refreshCookieOptions(req, false)); }
function deviceInfo(req) {
  const b = (req.body && req.body.device) || {};
  return { deviceName: b.deviceName, platform: b.platform, appVersion: req.header("x-app-version") || b.appVersion };
}
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });

function passwordFingerprint(hash) {
  return crypto.createHash("sha256").update(String(hash || "")).digest("hex").slice(0, 16);
}

// REGISTER
router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (typeof name !== "string" || !name.trim() || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== "string" || password.length < 6 || password.length > 200) {
      return res.status(400).json({ message: "Name, a valid email and a password of at least 6 characters are required" });
    }

    // ✅ Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    // ✅ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Create user
    await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    // ✅ Pre-fill the candidate profile (used by the extension's Profile tab
    // and the client's Profile page) with the name/email from registration,
    // so it doesn't show up blank the first time it's opened. This never
    // overwrites an existing profile someone has already filled in — it
    // only seeds a fresh one.
    try {
      const existingProfile = await prisma.user_profile.findFirst({
        orderBy: { id: "asc" },
      });

      if (!existingProfile) {
        await prisma.user_profile.create({
          data: { full_name: name, email },
        });
      }
    } catch (profileErr) {
      // Never fail registration because of the profile pre-fill step.
      console.error("Profile pre-fill failed:", profileErr.message);
    }

    res.status(201).json({
      message: "User Registered Successfully",
    });
  } catch (error) {
    // Prisma unique constraint fallback
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    res.status(500).json({
      message: error.message,
    });
  }
});

// LOGIN
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const mobile = isMobileClient(req);

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // ✅ Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Mobile gets one generic message (no account enumeration). Web keeps the
    // specific "User not found" text its Login page uses to suggest signing up.
    const generic = "Invalid email or password";

    if (!user) {
      return res.status(400).json({
        message: mobile ? generic : "User not found",
      });
    }

    // ✅ Compare password
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(400).json({
        message: mobile ? generic : "Invalid Password",
      });
    }

    if (mobile || isExtensionClient(req)) {
      const s = await sessions.issueSession(user, deviceInfo(req));
      return res.json({
        // `token` mirrors accessToken so existing mobile/extension clients keep working.
        token: s.accessToken,
        accessToken: s.accessToken,
        accessTokenExpiresAt: s.accessTokenExpiresAt,
        expiresIn: s.expiresIn,
        refreshToken: s.refreshToken,
        user: publicUser(user),
      });
    }

    if (isWebClient(req)) {
      const s = await sessions.issueSession(user, { deviceName: "Web browser", platform: "web" });
      setWebRefreshCookie(req, res, s.refreshToken, req.body?.rememberMe !== false);
      return res.json({ token: s.accessToken, accessToken: s.accessToken, accessTokenExpiresAt: s.accessTokenExpiresAt, expiresIn: s.expiresIn, user: publicUser(user) });
    }

    // ✅ Generate token (web / extension: unchanged)
    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: publicUser(user),
    });
  } catch (error) {
    // Log the error class / Prisma code only (never the message: it can echo
    // user data). P2021 = table missing (migration not deployed), P2022 =
    // column missing, TypeError = stale generated Prisma client.
    console.error(`[auth/login] failed: ${(error && (error.code || error.name)) || "unknown"}`);
    res.status(500).json({
      message: error.message,
    });
  }
});


// REFRESH — exchanges a refresh token for a new access token AND a new refresh
// token (rotation). 401 means the session is over and the user must sign in.
router.post("/refresh", refreshLimiter, async (req, res) => {
  try {
    const web = isWebClient(req);
    const refreshToken = web ? readCookie(req, "tt_refresh") : (req.body || {}).refreshToken;
    const r = await sessions.rotateSession(refreshToken, deviceInfo(req));
    if (!r.ok) {
      // `reused_recently` is a benign race (two requests refreshed at once):
      // tell the client to retry with the token it already received.
      const code = r.reason === "reused_recently" ? "refresh_in_progress" : "session_invalid";
      return res.status(401).json({ message: "Session expired. Please sign in again.", code });
    }
    if (web) setWebRefreshCookie(req, res, r.refreshToken, true);
    res.json({
      token: r.accessToken,
      accessToken: r.accessToken,
      accessTokenExpiresAt: r.accessTokenExpiresAt,
      expiresIn: r.expiresIn,
      refreshToken: r.refreshToken,
      user: publicUser(r.user),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ME — who am I. Also the cheapest way for a client to validate its session.
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(401).json({ message: "Account no longer exists", code: "token_invalid" });
    res.json({ user: { ...publicUser(user), gmailConnected: Boolean(user.gmailRefreshToken), createdAt: user.createdAt } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// LOGOUT — revokes the refresh-token family. Idempotent; never fails the client.
router.post("/logout", refreshLimiter, async (req, res) => {
  try {
    await sessions.revokeByRefreshToken(isWebClient(req) ? readCookie(req, "tt_refresh") : (req.body || {}).refreshToken);
  } catch (error) {
    console.error("logout revoke failed:", error.message);
  }
  if (isWebClient(req)) clearWebRefreshCookie(req, res);
  res.json({ message: "Signed out" });
});

// LOGOUT ALL — revokes every mobile session for the signed-in user.
router.post("/logout-all", authMiddleware, async (req, res) => {
  try {
    const count = await sessions.revokeAllForUser(req.user.id);
    res.json({ message: "Signed out everywhere", revoked: count });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE ACCOUNT — permanently removes the account and everything tied to it
// (tracked jobs, resumes, tailoring history, profile, sessions, push devices;
// all relations cascade). Requires the current password. Also revokes the
// stored Gmail grant at Google (best effort).
router.delete("/account", deleteLimiter, authMiddleware, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (typeof password !== "string" || !password) {
      return res.status(400).json({ message: "Password is required to delete your account" });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(401).json({ message: "Account no longer exists", code: "token_invalid" });
    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: "Password is incorrect" });
    }

    if (user.gmailRefreshToken) {
      try {
        const { getOAuthClient } = require("../config/google");
        await getOAuthClient().revokeToken(user.gmailRefreshToken);
      } catch (e) {
        console.error("Gmail revoke during account deletion failed");
      }
    }

    await prisma.user.delete({ where: { id: user.id } });
    if (isWebClient(req)) clearWebRefreshCookie(req, res);
    res.json({ message: "Your account and data have been deleted." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// FORGOT PASSWORD — sends a time-limited reset link to the user's email.
router.post("/forgot-password", forgotLimiter, async (req, res) => {
  try {
    const { email, source, redirectUri } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Web and Mobile get completely separate reset destinations — the
    // web app never sends `source`, so it always gets the CLIENT_URL
    // page below, unchanged from before. Mobile explicitly opts in with
    // `source: "mobile"` and must also supply its own `redirectUri`
    // (built with Linking.createURL(...), same mechanism as Gmail
    // OAuth's mobile flow — see gmailRoutes.js), validated against the
    // same mobile://exp:// allow-list so this can't become an open
    // redirect. An invalid/missing redirectUri for source=mobile fails
    // the request outright rather than silently falling back to the web
    // link, so a broken mobile client can't end up emailing itself a
    // web link it didn't ask for. `source: "extension"` shares the web
    // page too (see the resetUrl branch below) — it isn't a separate
    // redirect destination, just a flag the web page reads to show
    // extension-appropriate copy.
    let redirectDestination = null;
    if (source === "mobile") {
      if (!isAllowedResetRedirect(redirectUri)) {
        return res.status(400).json({
          message: "A valid mobile redirectUri is required when source=mobile",
        });
      }
      redirectDestination = redirectUri;
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Always respond with the same message whether or not the account
    // exists, so this endpoint can't be used to find out which emails
    // are registered.
    const genericMessage =
      "If an account exists for that email, a reset link has been sent.";

    if (!user) {
      return res.json({ message: genericMessage });
    }

    // `pv` fingerprints the password hash the token was issued against, so
    // the token stops working the moment the password changes — this makes
    // it effectively single-use without adding any column or table.
    const resetToken = jwt.sign(
      { id: user.id, purpose: "password_reset", pv: passwordFingerprint(user.password) },
      process.env.JWT_SECRET,
      { expiresIn: "30m" }
    );

    let resetUrl;
    if (redirectDestination) {
      // Mobile: the email link IS the deep link directly — no web page
      // in between, no "open in app" handoff, no mobile-browser
      // detection. Tapping it in Gmail hands straight to Expo Router's
      // reset-password screen (see mobile/app/reset-password.tsx).
      // When APP_LINK_BASE_URL is set the email carries a verified https App
      // Link / Universal Link (same trust model as the web link; falls back
      // to the web reset page if the app is not installed). Otherwise it is
      // the validated custom-scheme deep link, exactly as before.
      const appLinkBase = (process.env.APP_LINK_BASE_URL || "").replace(/\/+$/, "");
      // (Expo Go dev links stay custom-scheme: they cannot be App Links.)
      if (/^https:\/\//.test(appLinkBase) && !redirectDestination.startsWith("exp://")) {
        resetUrl = `${appLinkBase}/app/reset-password?token=${resetToken}`;
      } else {
        const sep = redirectDestination.includes("?") ? "&" : "?";
        resetUrl = `${redirectDestination}${sep}token=${resetToken}`;
      }
    } else {
      // Web AND Extension both land on the same web Reset Password page —
      // there is no stable, installation-independent extension ID this
      // server could safely build a chrome-extension:// link from (the
      // dev/unpacked extension ID differs per machine, and this project
      // isn't published to a store yet), so rather than invent one, the
      // extension gets the same trusted web destination with a `source`
      // flag the page uses only to adjust its own copy/branding — never
      // as a redirect target. Nothing here trusts a client-supplied URL.
      const clientUrl = (process.env.CLIENT_URL || "").split(",")[0] || "";
      const suffix = source === "extension" ? "&source=extension" : "";
      resetUrl = `${clientUrl}/reset-password?token=${resetToken}${suffix}`;
    }

    await sendPasswordResetEmail({ to: user.email, resetUrl });

    res.json({ message: genericMessage });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// RESET PASSWORD — verifies the token from the email link and sets a new password.
router.post("/reset-password", resetLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: "Token and new password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ message: "Reset link is invalid or has expired" });
    }

    if (decoded.purpose !== "password_reset") {
      return res.status(400).json({ message: "Reset link is invalid or has expired" });
    }

    const existing = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!existing || decoded.pv !== passwordFingerprint(existing.password)) {
      return res.status(400).json({ message: "Reset link is invalid or has expired" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: decoded.id },
      data: { password: hashedPassword },
    });

    // A password reset must end every existing mobile session.
    try {
      await sessions.revokeAllForUser(decoded.id);
    } catch (e) {
      console.error("session revoke after reset failed:", e.message);
    }

    res.json({ message: "Password has been reset. You can now log in." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
