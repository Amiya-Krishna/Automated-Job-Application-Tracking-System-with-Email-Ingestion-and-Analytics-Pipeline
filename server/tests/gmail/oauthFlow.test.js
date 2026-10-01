// Gmail OAuth across Web, Extension and Mobile, through the REAL authRoutes, gmailRoutes,
// authMiddleware and session logic (only the database and Google's token endpoint are
// faked). The properties under test: the callback knows which client started the flow and
// where to return, validates that target, saves Gmail for exactly the user named in the
// signed state, and never creates, rotates or revokes a TrackTrail login session.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-secret";
process.env.RL_LOGIN_MAX = "1000";
process.env.RL_REFRESH_MAX = "1000";
process.env.CLIENT_URL = "https://app.example.test,http://localhost:5173";
process.env.GOOGLE_REDIRECT_URI = "https://api.example.test/api/gmail/callback";
delete process.env.SERVER_URL;
delete process.env.EXTENSION_REDIRECT_URL;

// ---- in-memory database ----------------------------------------------------
const db = { users: [], sessions: [] };
const addUser = (id, email) => db.users.push({ id, name: `U${id}`, email, password: bcrypt.hashSync("pw-123456", 4), gmailRefreshToken: null });
addUser(1, "a@x.co");
addUser(2, "b@x.co");
const matches = (row, where) => Object.entries(where).every(([k, v]) => (v === null ? row[k] == null : row[k] === v));
const prismaStub = {
  user: {
    findUnique: async ({ where }) => db.users.find((u) => matches(u, where)) || null,
    update: async ({ where, data }) => Object.assign(db.users.find((u) => matches(u, where)), data),
  },
  userSession: {
    create: async ({ data }) => { const row = { id: crypto.randomUUID(), rotatedAt: null, revokedAt: null, ...data }; db.sessions.push(row); return row; },
    findUnique: async ({ where }) => db.sessions.find((s) => matches(s, where)) || null,
    update: async ({ where, data }) => Object.assign(db.sessions.find((s) => matches(s, where)), data),
    updateMany: async ({ where, data }) => { const rows = db.sessions.filter((s) => matches(s, where)); rows.forEach((r) => Object.assign(r, data)); return { count: rows.length }; },
  },
};
const stub = (rel, exports) => {
  const id = require.resolve(path.join("..", "..", rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
};
stub("lib/prisma", prismaStub);
stub("services/emailService", { sendPasswordResetEmail: async () => {} });
stub("services/engineBridge", { bridgeTrackedJobToEngine: async () => {} });
// Google: the code decides the outcome.
stub("config/google", {
  GMAIL_SCOPES: ["gmail.readonly"],
  getOAuthClient: () => ({
    generateAuthUrl: ({ state }) => `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}`,
    getToken: async (code) => {
      if (code === "boom") throw new Error("invalid_grant");
      if (code === "norefresh") return { tokens: { access_token: "at" } };
      return { tokens: { refresh_token: `rt-${code}` } };
    },
  }),
});

const express = require("express");
const { buildCorsOptions } = require("../../middleware/corsOptions");
const cors = require("cors");
const app = express();
app.use(cors(buildCorsOptions({ allowedOrigins: ["https://app.example.test", "http://localhost:5173"], nodeEnv: "production" })));
app.use(express.json());
app.use("/api/auth", require("../../routes/authRoutes"));
app.use("/api/gmail", require("../../routes/gmailRoutes"));
app.use(express.static(path.join(__dirname, "..", "..", "public")));
app.use((err, req, res, next) => res.status(err.status || 500).json({ message: err.message }));

let server, base;
test.before(async () => { server = http.createServer(app); await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());

const J = { "Content-Type": "application/json" };
async function login(client, email = "a@x.co") {
  const res = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { ...J, "x-client": client }, body: JSON.stringify({ email, password: "pw-123456" }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  const cookie = (res.headers.get("set-cookie") || "").split(";")[0] || null;
  return { ...body, cookie };
}
async function authUrl(token, query = "", headers = {}) {
  const res = await fetch(`${base}/api/gmail/auth-url${query}`, { headers: { token, ...headers } });
  const body = await res.json();
  const state = body.url ? new URL(body.url).searchParams.get("state") : null;
  return { res, body, state, decoded: state ? jwt.decode(state) : null };
}
const callback = (state, code = "good") => fetch(`${base}/api/gmail/callback?code=${code}&state=${encodeURIComponent(state)}`, { redirect: "manual" });
const sessionSnapshot = () => JSON.stringify(db.sessions);
const connected = (id) => Boolean(db.users.find((u) => u.id === id).gmailRefreshToken);
const reset = () => { db.users.forEach((u) => (u.gmailRefreshToken = null)); };

// ============================== WEB ==========================================
test("WEB: logged-in user starts from /integrations on the SECOND allowed origin; callback returns there, keeps the session, saves Gmail", async () => {
  reset();
  const s = await login("web");
  assert.ok(s.cookie && s.accessToken);
  const before = sessionSnapshot();

  const start = await authUrl(s.accessToken, "?returnTo=%2Fintegrations%3Ftab%3Demail", { "x-client": "web", Origin: "http://localhost:5173" });
  assert.equal(start.res.status, 200);
  assert.equal(start.decoded.source, "web");
  assert.equal(start.decoded.returnOrigin, "http://localhost:5173"); // not just the FIRST CLIENT_URL entry
  assert.equal(start.decoded.returnPath, "/integrations?tab=email");
  assert.equal(start.decoded.id, 1);

  const cb = await callback(start.state);
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get("location"), "http://localhost:5173/integrations?tab=email&gmail=connected");
  assert.equal(cb.headers.get("set-cookie"), null, "the callback must not set or clear any cookie");
  assert.equal(cb.headers.get("cache-control"), "no-store");

  // Not logged out: no session row created, rotated or revoked ...
  assert.equal(sessionSnapshot(), before);
  // ... the existing refresh cookie still restores the session (what a reload of the SPA does) ...
  const refresh = await fetch(`${base}/api/auth/refresh`, { method: "POST", headers: { "x-client": "web", cookie: s.cookie } });
  assert.equal(refresh.status, 200);
  const refreshed = await refresh.json();
  assert.equal(refreshed.user.id, 1);
  // ... and Gmail is connected as soon as the page asks.
  const status = await fetch(`${base}/api/gmail/status`, { headers: { token: refreshed.accessToken } });
  assert.deepEqual(await status.json(), { connected: true });
  assert.equal(db.users[0].gmailRefreshToken, "rt-good");
});

test("WEB: with no usable Origin or returnTo it falls back to the first allowed origin and /integrations", async () => {
  const s = await login("web");
  const start = await authUrl(s.accessToken, "", { "x-client": "web" });
  assert.equal(start.decoded.returnOrigin, "https://app.example.test");
  assert.equal(start.decoded.returnPath, "/integrations");
  assert.equal((await callback(start.state)).headers.get("location"), "https://app.example.test/integrations?gmail=connected");
});

test("SECURITY: a foreign Origin header and hostile returnTo values can never become the redirect target", async () => {
  const s = await login("web");
  const evilOrigin = await authUrl(s.accessToken, "", { "x-client": "web", Origin: "https://evil.test" });
  // (CORS blocks the browser from reading this response, but the server must not honor it either.)
  assert.notEqual(evilOrigin.decoded?.returnOrigin, "https://evil.test");

  for (const bad of ["//evil.test/x", "https://evil.test/x", "/\\evil.test", "javascript:alert(1)", "/ok\r\nLocation: https://evil.test", "evil.test", "/".padEnd(400, "a"), "/a/../../..//evil.test"]) {
    const st = await authUrl(s.accessToken, `?returnTo=${encodeURIComponent(bad)}`, { "x-client": "web" });
    const loc = (await callback(st.state)).headers.get("location");
    const u = new URL(loc);
    assert.ok(["https://app.example.test", "http://localhost:5173"].includes(u.origin), `${bad} -> ${loc}`);
    assert.ok(!u.pathname.startsWith("//"), `${bad} -> ${loc}`);
  }
});

test("SECURITY: the callback re-validates the origin inside the signed state (defense in depth)", async () => {
  const forged = jwt.sign({ id: 1, source: "web", purpose: "gmail_oauth", returnOrigin: "https://evil.test", returnPath: "//evil.test" }, process.env.JWT_SECRET, { expiresIn: "5m" });
  const loc = (await callback(forged)).headers.get("location");
  assert.equal(loc, "https://app.example.test/integrations?gmail=connected");
});

// ============================ EXTENSION ======================================
test("EXTENSION: callback lands on Chrome Identity redirect, session untouched, Gmail connected", async () => {
  reset();
  process.env.EXTENSION_OAUTH_REDIRECT_URI = "https://mkmccbmcbhgnjejhhmnhibiepdadloia.chromiumapp.org/gmail";
  try {
    const s = await login("extension");
    const before = sessionSnapshot();
    const start = await authUrl(
      s.accessToken,
      `?source=extension&redirectUri=${encodeURIComponent(process.env.EXTENSION_OAUTH_REDIRECT_URI)}`,
      { "x-client": "extension", Origin: "chrome-extension://mkmccbmcbhgnjejhhmnhibiepdadloia" }
    );
    assert.equal(start.res.status, 200);
    assert.equal(start.decoded.source, "extension");
    assert.equal(start.decoded.redirectUri, process.env.EXTENSION_OAUTH_REDIRECT_URI);
    assert.equal(new URL(start.body.url).origin, "https://accounts.google.com");

    const cb = await callback(start.state);
    assert.equal(cb.status, 302);
    const loc = cb.headers.get("location");
    assert.equal(loc, `${process.env.EXTENSION_OAUTH_REDIRECT_URI}?gmail=connected`);
    assert.equal(cb.headers.get("set-cookie"), null);
    assert.equal(sessionSnapshot(), before);

    const me = await fetch(`${base}/api/auth/me`, { headers: { token: s.accessToken, "x-client": "extension" } });
    assert.equal(me.status, 200);
    const status = await fetch(`${base}/api/gmail/status`, { headers: { token: s.accessToken, "x-client": "extension" } });
    assert.deepEqual(await status.json(), { connected: true });
  } finally { delete process.env.EXTENSION_OAUTH_REDIRECT_URI; }
});

test("EXTENSION: redirect URI must be explicitly configured and must match the extension", async () => {
  reset();
  delete process.env.EXTENSION_OAUTH_REDIRECT_URI;
  delete process.env.EXTENSION_REDIRECT_URL;
  const s = await login("extension");
  const missing = await authUrl(s.accessToken, "?source=extension", { "x-client": "extension" });
  assert.equal(missing.res.status, 503);

  process.env.EXTENSION_OAUTH_REDIRECT_URI = "https://mkmccbmcbhgnjejhhmnhibiepdadloia.chromiumapp.org/gmail";
  try {
    const mismatch = await authUrl(s.accessToken, `?source=extension&redirectUri=${encodeURIComponent("https://other.chromiumapp.org/gmail")}`, { "x-client": "extension" });
    assert.equal(mismatch.res.status, 400);
  } finally { delete process.env.EXTENSION_OAUTH_REDIRECT_URI; }
});

test("EXTENSION: invalid configured redirect values are rejected", () => {
  const { extensionOAuthRedirectUrl } = require("../../utils/oauthReturn");
  const valid = "https://abcdefghijklmnop.chromiumapp.org/gmail";
  assert.equal(extensionOAuthRedirectUrl({ EXTENSION_OAUTH_REDIRECT_URI: valid }), valid);
  for (const value of [
    "chrome-extension://abcdefghijklmnop/dashboard.html",
    "https://evil.example/gmail",
    "http://abcdefghijklmnop.chromiumapp.org/gmail",
    "https://abcdefghijklmnop.chromiumapp.org/gmail?x=1",
  ]) assert.equal(extensionOAuthRedirectUrl({ EXTENSION_OAUTH_REDIRECT_URI: value }), null, value);
});

test("EXTENSION: the legacy landing page remains available but is not used by the new OAuth state", async () => {
  const res = await fetch(`${base}/extension/gmail-success.html?gmail=connected`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Gmail connected/);
});

// ============================== MOBILE =======================================
test("MOBILE: logged-in app starts OAuth with its own deep link; callback returns exactly there; session stays valid", async () => {
  reset();
  const s = await login("mobile");
  assert.ok(s.refreshToken);
  const before = sessionSnapshot();
  const redirectUri = "tracktrail://gmail-callback";
  const start = await authUrl(s.accessToken, `?source=mobile&redirectUri=${encodeURIComponent(redirectUri)}`, { "x-client": "mobile" });
  assert.equal(start.res.status, 200);
  assert.equal(start.decoded.redirectUri, redirectUri);

  const cb = await callback(start.state);
  assert.equal(cb.headers.get("location"), "tracktrail://gmail-callback?gmail=connected");
  assert.equal(cb.headers.get("set-cookie"), null);
  assert.equal(sessionSnapshot(), before);

  // The app's existing session still works and shows the connection immediately.
  const refresh = await fetch(`${base}/api/auth/refresh`, { method: "POST", headers: { ...J, "x-client": "mobile" }, body: JSON.stringify({ refreshToken: s.refreshToken }) });
  assert.equal(refresh.status, 200);
  const status = await fetch(`${base}/api/gmail/status`, { headers: { token: s.accessToken } });
  assert.deepEqual(await status.json(), { connected: true });
});

test("MOBILE: legacy mobile:// scheme and Expo Go (private LAN host, dev only) work; anything else is rejected before Google is opened", async () => {
  const s = await login("mobile");
  const ok = ["mobile://gmail-callback", "exp://192.168.1.5:8081/--/gmail-callback"];
  for (const r of ok) assert.equal((await authUrl(s.accessToken, `?source=mobile&redirectUri=${encodeURIComponent(r)}`)).res.status, 200, r);
  const bad = [
    "https://evil.test/cb", "http://evil.test/cb", "javascript:alert(1)", "tracktrail://evil-host/x", "tracktrail://gmail-callback/../x",
    "tracktrail://gmail-callback?next=https://evil.test", "tracktrail://user:pw@gmail-callback", "exp://evil.example.com/--/gmail-callback",
    "exp://192.168.1.5:8081/--/other", "exp://192.168.1.5:8081/--/gmail-callback?x=1", "tracktrail://reset-password", "", undefined,
  ];
  for (const r of bad) {
    const q = r === undefined ? "?source=mobile" : `?source=mobile&redirectUri=${encodeURIComponent(r)}`;
    assert.equal((await authUrl(s.accessToken, q)).res.status, 400, String(r));
  }
});

test("MOBILE: Expo Go deep links are refused in production unless explicitly enabled", () => {
  const { isAllowedGmailRedirect } = require("../../utils/oauthReturn");
  const exp = "exp://192.168.1.5:8081/--/gmail-callback";
  assert.equal(isAllowedGmailRedirect(exp, { NODE_ENV: "production" }), false);
  assert.equal(isAllowedGmailRedirect(exp, { NODE_ENV: "production", ALLOW_EXPO_GO_RESET_REDIRECT: "true" }), true);
  assert.equal(isAllowedGmailRedirect("tracktrail://gmail-callback", { NODE_ENV: "production" }), true);
  assert.equal(isAllowedGmailRedirect("mobile://gmail-callback", { NODE_ENV: "production" }), true);
});

// ============================== SECURITY =====================================
test("SECURITY: invalid, expired, wrongly-signed or wrong-purpose state is rejected and saves nothing", async () => {
  reset();
  const secret = process.env.JWT_SECRET;
  const login1 = await login("web");
  const states = {
    garbage: "not-a-jwt",
    expired: jwt.sign({ id: 1, source: "web", purpose: "gmail_oauth" }, secret, { expiresIn: -10 }),
    wrongSecret: jwt.sign({ id: 1, source: "web", purpose: "gmail_oauth" }, "other-secret", { expiresIn: "5m" }),
    noPurpose: jwt.sign({ id: 1, source: "web" }, secret, { expiresIn: "5m" }),
    loginToken: login1.accessToken, // a real access token must never work as OAuth state
    resetToken: jwt.sign({ id: 1, purpose: "password_reset" }, secret, { expiresIn: "5m" }),
    noneAlg: Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") + "." + Buffer.from(JSON.stringify({ id: 1, purpose: "gmail_oauth", source: "web" })).toString("base64url") + ".",
  };
  for (const [name, state] of Object.entries(states)) {
    const cb = await callback(state);
    assert.equal(cb.status, 302, name);
    assert.match(cb.headers.get("location"), /^https:\/\/app\.example\.test\/integrations\?gmail=error$/, name);
    assert.equal(cb.headers.get("set-cookie"), null, name);
  }
  assert.equal(connected(1), false);
  assert.equal(connected(2), false);
  // missing code / state
  assert.match((await fetch(`${base}/api/gmail/callback`, { redirect: "manual" })).headers.get("location"), /gmail=error$/);
});

test("SECURITY: the callback cannot authenticate or connect a different TrackTrail user", async () => {
  reset();
  const a = await login("web", "a@x.co");
  const b = await login("web", "b@x.co");
  const startA = await authUrl(a.accessToken, "", { "x-client": "web" });
  assert.equal(startA.decoded.id, 1);

  // Presenting B's cookie/token to the callback changes nothing: only the signed state decides.
  const cb = await fetch(`${base}/api/gmail/callback?code=good&state=${encodeURIComponent(startA.state)}`, { redirect: "manual", headers: { cookie: b.cookie, token: b.accessToken } });
  assert.equal(cb.headers.get("set-cookie"), null);
  assert.equal(cb.headers.get("authorization"), null);
  assert.equal(connected(1), true);
  assert.equal(connected(2), false);
  // The callback body/redirect never contains a login token.
  assert.doesNotMatch(cb.headers.get("location"), /token|eyJ/i);
});

test("SECURITY: starting the flow requires a valid TrackTrail session", async () => {
  assert.equal((await fetch(`${base}/api/gmail/auth-url`)).status, 401);
  assert.equal((await fetch(`${base}/api/gmail/auth-url`, { headers: { token: "garbage" } })).status, 401);
  assert.equal((await fetch(`${base}/api/gmail/status`)).status, 401);
});

test("SECURITY: Google denying a refresh token or failing the exchange saves nothing", async () => {
  reset();
  const s = await login("web");
  const start = await authUrl(s.accessToken, "", { "x-client": "web" });
  assert.match((await callback(start.state, "norefresh")).headers.get("location"), /gmail=no_refresh_token$/);
  assert.match((await callback(start.state, "boom")).headers.get("location"), /gmail=error$/);
  assert.equal(connected(1), false);
});

test("UTIL: sanitizeReturnPath keeps same-origin paths (+query), drops fragments and stale gmail flags", () => {
  const { sanitizeReturnPath } = require("../../utils/oauthReturn");
  assert.equal(sanitizeReturnPath("/integrations"), "/integrations");
  assert.equal(sanitizeReturnPath("/applications?status=offer&gmail=connected#x"), "/applications?status=offer");
  assert.equal(sanitizeReturnPath("//evil.test"), "/integrations");
  assert.equal(sanitizeReturnPath("/a/..//evil.test"), "/integrations"); // collapses to //evil.test
  assert.equal(sanitizeReturnPath(undefined), "/integrations");
  assert.equal(sanitizeReturnPath({}), "/integrations");
  assert.equal(sanitizeReturnPath("/x", "/home"), "/x");
  assert.equal(sanitizeReturnPath("nope", "/home"), "/home");
});
