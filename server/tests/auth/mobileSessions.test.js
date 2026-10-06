// Drives the REAL routes/authRoutes.js + lib/sessions.js + authMiddleware over
// HTTP. Only Prisma (in-memory) and the email sender are stubbed.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-secret";
process.env.CLIENT_URL = "https://app.example.test";
process.env.REFRESH_REUSE_GRACE_SECONDS = "0.5";
process.env.RL_LOGIN_MAX = "1000";

const db = { users: [{ id: 7, name: "Ada", email: "a@b.co", status: "ACTIVE", password: bcrypt.hashSync("oldpass1", 4), gmailRefreshToken: null, createdAt: new Date() }], sessions: [] };
const stub = (rel, exports) => {
  const id = require.resolve(path.join("..", "..", rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
};
const match = (row, where) => Object.entries(where).every(([k, v]) => (v && typeof v === "object" && "in" in v ? v.in.includes(row[k]) : v === null ? row[k] == null : row[k] === v));
stub("lib/prisma", {
  user: {
    findUnique: async ({ where }) => db.users.find((u) => match(u, where)) || null,
    update: async ({ where, data }) => Object.assign(db.users.find((u) => u.id === where.id), data),
    count: async () => 0,
    delete: async ({ where }) => { db.users = db.users.filter((u) => u.id !== where.id); db.sessions = db.sessions.filter((s) => s.userId !== where.id); },
  },
  userSession: {
    create: async ({ data }) => { const row = { id: crypto.randomUUID(), createdAt: new Date(), lastUsedAt: new Date(), revokedAt: null, rotatedAt: null, ...data }; db.sessions.push(row); return row; },
    findUnique: async ({ where }) => db.sessions.find((s) => match(s, where)) || null,
    update: async ({ where, data }) => Object.assign(db.sessions.find((s) => s.id === where.id), data),
    updateMany: async ({ where, data }) => { const rows = db.sessions.filter((s) => match(s, where)); rows.forEach((r) => Object.assign(r, data)); return { count: rows.length }; },
    deleteMany: async () => ({ count: 0 }),
  },
  // account deletion (services/accountDeletion.js) runs in a transaction over these:
  user_profile: { findUnique: async () => null },
  match_scores: { deleteMany: async () => ({ count: 0 }) },
  jobs: { findMany: async () => [], updateMany: async () => ({ count: 0 }), deleteMany: async () => ({ count: 0 }) },
  get $transaction() { return async (fn) => fn(this); },
});
stub("services/emailService", { sendPasswordResetEmail: async () => {} });

const express = require("express");
const app = express();
app.use(express.json());
app.use("/api/auth", require("../../routes/authRoutes"));

let server, base;
test.before(async () => {
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}/api/auth`;
});
test.after(() => server.close());

const call = (method, p, body, headers = {}) =>
  fetch(base + p, { method, headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
const mobileLogin = (password = "oldpass1") => call("POST", "/login", { email: "a@b.co", password, device: { platform: "android" } }, { "x-client": "mobile" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("web login is unchanged: one 7-day token, no refresh token, specific error text", async () => {
  const ok = await (await call("POST", "/login", { email: "a@b.co", password: "oldpass1" })).json();
  assert.ok(ok.token);
  assert.equal(ok.refreshToken, undefined);
  const decoded = jwt.decode(ok.token);
  assert.equal(decoded.exp - decoded.iat, 7 * 86400);
  const bad = await call("POST", "/login", { email: "nobody@b.co", password: "x" });
  assert.equal((await bad.json()).message, "User not found");
});

test("mobile login: short-lived access token + refresh token; generic error (no account enumeration)", async () => {
  const res = await mobileLogin();
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(body.accessToken && body.refreshToken);
  assert.equal(body.token, body.accessToken);
  const d = jwt.decode(body.accessToken);
  assert.equal(d.exp - d.iat, 900);
  assert.equal(d.typ, "access");
  assert.equal(db.sessions.at(-1).refreshTokenHash.length, 64, "only a hash is stored");
  assert.notEqual(db.sessions.at(-1).refreshTokenHash, body.refreshToken);

  const unknown = await (await call("POST", "/login", { email: "nobody@b.co", password: "x" }, { "x-client": "mobile" })).json();
  const wrong = await (await mobileLogin("wrong")).json();
  assert.equal(unknown.message, "Invalid email or password");
  assert.equal(wrong.message, "Invalid email or password");
});

test("/auth/me: 200 with a valid token; 401 for missing, expired, garbage and purpose tokens", async () => {
  const { accessToken } = await (await mobileLogin()).json();
  const me = await call("GET", "/me", null, { token: accessToken });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.email, "a@b.co");
  const bearer = await call("GET", "/me", null, { Authorization: `Bearer ${accessToken}` });
  assert.equal(bearer.status, 200);

  assert.equal((await call("GET", "/me")).status, 401);
  const expired = jwt.sign({ id: 7, typ: "access" }, "test-secret", { expiresIn: -10 });
  const r = await call("GET", "/me", null, { token: expired });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).code, "token_expired");
  assert.equal((await call("GET", "/me", null, { token: "garbage" })).status, 401);
  const reset = jwt.sign({ id: 7, purpose: "password_reset" }, "test-secret", { expiresIn: "5m" });
  assert.equal((await call("GET", "/me", null, { token: reset })).status, 401, "a reset token must never act as a login token");
  const gmailState = jwt.sign({ id: 7, purpose: "gmail_oauth" }, "test-secret", { expiresIn: "5m" });
  assert.equal((await call("GET", "/me", null, { token: gmailState })).status, 401);
});

test("refresh rotates the token; replaying an old one revokes the whole session family", async () => {
  const first = await (await mobileLogin()).json();
  const second = await (await call("POST", "/refresh", { refreshToken: first.refreshToken })).json();
  assert.ok(second.refreshToken && second.refreshToken !== first.refreshToken);
  assert.ok(second.accessToken);

  // Immediate replay = benign race: rejected, but the family stays alive.
  const race = await call("POST", "/refresh", { refreshToken: first.refreshToken });
  assert.equal(race.status, 401);
  assert.equal((await race.json()).code, "refresh_in_progress");
  const stillGood = await call("POST", "/refresh", { refreshToken: second.refreshToken });
  assert.equal(stillGood.status, 200);
  const third = await stillGood.json();

  // Replay after the grace window = theft signal: everything in the family dies.
  await sleep(650);
  const replay = await call("POST", "/refresh", { refreshToken: first.refreshToken });
  assert.equal(replay.status, 401);
  assert.equal((await replay.json()).code, "session_invalid");
  const afterTheft = await call("POST", "/refresh", { refreshToken: third.refreshToken });
  assert.equal(afterTheft.status, 401);
});

test("refresh rejects junk, expired and unknown tokens", async () => {
  for (const refreshToken of [undefined, "", "short", "x".repeat(300), crypto.randomBytes(32).toString("base64url")]) {
    assert.equal((await call("POST", "/refresh", { refreshToken })).status, 401);
  }
  const { refreshToken } = await (await mobileLogin()).json();
  db.sessions.find((s) => s.refreshTokenHash === require("../../lib/sessions").hashToken(refreshToken)).expiresAt = new Date(Date.now() - 1000);
  assert.equal((await call("POST", "/refresh", { refreshToken })).status, 401);
});

test("logout revokes the session; it is idempotent and never errors", async () => {
  const { refreshToken } = await (await mobileLogin()).json();
  assert.equal((await call("POST", "/logout", { refreshToken })).status, 200);
  assert.equal((await call("POST", "/refresh", { refreshToken })).status, 401);
  assert.equal((await call("POST", "/logout", { refreshToken })).status, 200);
  assert.equal((await call("POST", "/logout", {})).status, 200);
});

test("logout-all and password reset both end every mobile session", async () => {
  const a = await (await mobileLogin()).json();
  const b = await (await mobileLogin()).json();
  assert.equal((await call("POST", "/logout-all", null, { token: a.accessToken })).status, 200);
  assert.equal((await call("POST", "/refresh", { refreshToken: b.refreshToken })).status, 401);

  const c = await (await mobileLogin()).json();
  const user = db.users[0];
  const fp = crypto.createHash("sha256").update(user.password).digest("hex").slice(0, 16);
  const token = jwt.sign({ id: 7, purpose: "password_reset", pv: fp }, "test-secret", { expiresIn: "30m" });
  const reset = await call("POST", "/reset-password", { token, password: "newpass1" });
  assert.equal(reset.status, 200);
  assert.equal((await call("POST", "/refresh", { refreshToken: c.refreshToken })).status, 401);
  assert.equal((await mobileLogin("newpass1")).status, 200);
});

test("delete account: needs auth + correct password, then removes the user and sessions", async () => {
  const { accessToken } = await (await mobileLogin("newpass1")).json();
  assert.equal((await call("DELETE", "/account", { password: "x" })).status, 401);
  assert.equal((await call("DELETE", "/account", {}, { token: accessToken })).status, 400);
  assert.equal((await call("DELETE", "/account", { password: "wrong" }, { token: accessToken })).status, 400);
  assert.equal(db.users.length, 1);
  const ok = await call("DELETE", "/account", { password: "newpass1" }, { token: accessToken });
  assert.equal(ok.status, 200);
  assert.equal(db.users.length, 0);
  assert.equal(db.sessions.length, 0);
  assert.equal((await call("GET", "/me", null, { token: accessToken })).status, 401);
});
