// Drives the REAL routes/authRoutes.js router over HTTP. Only the two
// external edges are stubbed: Prisma (in-memory user) and the email
// sender (captures the URL that would have been emailed).
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-secret";
process.env.RL_FORGOT_MAX = "1000"; // this file fires many requests from one IP; limiter behaviour is covered elsewhere
process.env.RL_RESET_MAX = "1000";
process.env.CLIENT_URL = "https://app.example.test,https://other.example.test";

const user = { id: 7, email: "a@b.co", password: bcrypt.hashSync("oldpass1", 4) };
const sent = [];

function stub(rel, exports) {
  const id = require.resolve(path.join("..", "..", rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
stub("lib/prisma", {
  user: {
    findUnique: async ({ where }) =>
      (where.email === user.email || where.id === user.id) ? { ...user } : null,
    update: async ({ data }) => { user.password = data.password; return user; },
  },
});
stub("services/emailService", { sendPasswordResetEmail: async (m) => { sent.push(m); } });

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

const post = (p, body) =>
  fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function requestReset(body) {
  sent.length = 0;
  const res = await post("/forgot-password", { email: user.email, ...body });
  return { res, url: sent[0]?.resetUrl };
}

test("origin=web -> web reset page on the first CLIENT_URL, no source flag", async () => {
  const { res, url } = await requestReset({});
  assert.equal(res.status, 200);
  assert.match(url, /^https:\/\/app\.example\.test\/reset-password\?token=[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.ok(!url.includes("source="));
});

test("origin=mobile -> mobile deep link (mobile:// and exp://), never the web URL", async () => {
  let r = await requestReset({ source: "mobile", redirectUri: "mobile://reset-password" });
  assert.match(r.url, /^mobile:\/\/reset-password\?token=/);
  r = await requestReset({ source: "mobile", redirectUri: "exp://192.168.1.5:8081/--/reset-password" });
  assert.match(r.url, /^exp:\/\/192\.168\.1\.5:8081\/--\/reset-password\?token=/);
});

test("origin=mobile with a non-allow-listed redirect is rejected (no open redirect, no email)", async () => {
  for (const redirectUri of ["https://evil.test/x", "javascript:alert(1)", undefined]) {
    const { res, url } = await requestReset({ source: "mobile", redirectUri });
    assert.equal(res.status, 400);
    assert.equal(url, undefined);
  }
});

test("origin=extension -> trusted web reset page flagged source=extension; client redirectUri is ignored", async () => {
  const { url } = await requestReset({ source: "extension", redirectUri: "https://evil.test/steal" });
  assert.match(url, /^https:\/\/app\.example\.test\/reset-password\?token=[^&]+&source=extension$/);
  assert.ok(!url.includes("evil.test"));
});

test("unknown source falls back to the plain web link", async () => {
  const { url } = await requestReset({ source: "toaster" });
  assert.match(url, /^https:\/\/app\.example\.test\/reset-password\?token=[^&]+$/);
});

test("unknown email gets the same generic response and sends nothing", async () => {
  sent.length = 0;
  const res = await post("/forgot-password", { email: "nobody@x.co" });
  assert.equal(res.status, 200);
  assert.equal(sent.length, 0);
});

test("token: 30 min expiry, purpose-scoped; reset succeeds once, then the same link is dead", async () => {
  const { url } = await requestReset({ source: "extension" });
  const token = new URL(url).searchParams.get("token");
  const claims = jwt.decode(token);
  assert.equal(claims.purpose, "password_reset");
  assert.equal(claims.exp - claims.iat, 30 * 60);

  const ok = await post("/reset-password", { token, password: "newpass1" });
  assert.equal(ok.status, 200);
  assert.ok(await bcrypt.compare("newpass1", user.password));

  const replay = await post("/reset-password", { token, password: "another1" });
  assert.equal(replay.status, 400);
  assert.ok(await bcrypt.compare("newpass1", user.password));
});

test("invalid, expired, wrong-purpose tokens and short passwords are rejected", async () => {
  const bad = await post("/reset-password", { token: "garbage", password: "newpass1" });
  assert.equal(bad.status, 400);

  const expired = jwt.sign({ id: user.id, purpose: "password_reset" }, "test-secret", { expiresIn: -10 });
  assert.equal((await post("/reset-password", { token: expired, password: "newpass1" })).status, 400);

  const wrong = jwt.sign({ id: user.id, purpose: "login" }, "test-secret", { expiresIn: "5m" });
  assert.equal((await post("/reset-password", { token: wrong, password: "newpass1" })).status, 400);

  const { url } = await requestReset({});
  const token = new URL(url).searchParams.get("token");
  assert.equal((await post("/reset-password", { token, password: "123" })).status, 400);
});
