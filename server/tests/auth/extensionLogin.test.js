// Extension login = POST /api/auth/login with `x-client: extension`, which goes
// through sessions.issueSession() -> prisma.userSession.create (table user_sessions).
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-secret";
process.env.RL_LOGIN_MAX = "1000";

const db = { users: [{ id: 9, name: "Ext", email: "e@x.co", status: "ACTIVE", password: bcrypt.hashSync("pw-123456", 4) }], sessions: [], sessionsTableMissing: false };
const stub = (rel, exports) => {
  const id = require.resolve(path.join("..", "..", rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
};
stub("lib/prisma", {
  user: { findUnique: async ({ where }) => db.users.find((u) => u.email === where.email || u.id === where.id) || null },
  userSession: {
    create: async ({ data }) => {
      if (db.sessionsTableMissing) { const e = new Error("The table `public.user_sessions` does not exist"); e.code = "P2021"; throw e; }
      const row = { id: crypto.randomUUID(), ...data }; db.sessions.push(row); return row;
    },
  },
});
stub("services/emailService", { sendPasswordResetEmail: async () => {} });

const express = require("express");
const app = express();
app.use(express.json());
app.use("/api/auth", require("../../routes/authRoutes"));
let server, base;
test.before(async () => { server = http.createServer(app); await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}/api/auth`; });
test.after(() => server.close());
const login = (body) => fetch(base + "/login", { method: "POST", headers: { "Content-Type": "application/json", "x-client": "extension" }, body: JSON.stringify(body) });

test("extension login returns access + refresh token and stores only a hash", async () => {
  const res = await login({ email: "e@x.co", password: "pw-123456" });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(body.accessToken && body.refreshToken);
  assert.equal(body.token, body.accessToken);
  assert.equal(jwt.decode(body.accessToken).typ, "access");
  assert.equal(db.sessions.at(-1).refreshTokenHash.length, 64);
  assert.notEqual(db.sessions.at(-1).refreshTokenHash, body.refreshToken);
});

test("extension login: wrong credentials stay 400 (not 5xx)", async () => {
  assert.equal((await login({ email: "e@x.co", password: "nope" })).status, 400);
  assert.equal((await login({ email: "none@x.co", password: "nope" })).status, 400);
});

test("missing user_sessions table -> 500 and the log names the Prisma code (P2021) so the cause is diagnosable", async (t) => {
  db.sessionsTableMissing = true;
  t.after(() => { db.sessionsTableMissing = false; });
  const lines = [];
  const orig = console.error;
  console.error = (...a) => lines.push(a.join(" "));
  let res;
  try { res = await login({ email: "e@x.co", password: "pw-123456" }); } finally { console.error = orig; }
  assert.equal(res.status, 500);
  assert.ok(lines.some((l) => l.includes("[auth/login] failed: P2021")), lines.join("|"));
  assert.ok(!lines.some((l) => l.includes("does not exist")), "raw error message must not be logged");
});

test("schema check reports a missing table / stale client and never throws", async () => {
  const { warnIfSessionsTableMissing } = require("../../lib/schemaCheck");
  const logs = [];
  const log = { error: (m) => logs.push(m) };
  assert.equal(await warnIfSessionsTableMissing({}, log), false);
  assert.match(logs.at(-1), /prisma generate/);
  assert.equal(await warnIfSessionsTableMissing({ userSession: {}, $queryRaw: async () => [{ t: null }] }, log), false);
  assert.match(logs.at(-1), /migrate deploy/);
  assert.equal(await warnIfSessionsTableMissing({ userSession: {}, $queryRaw: async () => [{ t: "user_sessions" }] }, log), true);
  assert.equal(await warnIfSessionsTableMissing({ userSession: {}, $queryRaw: async () => { const e = new Error("boom"); e.code = "P1001"; throw e; } }, log), false);
});
