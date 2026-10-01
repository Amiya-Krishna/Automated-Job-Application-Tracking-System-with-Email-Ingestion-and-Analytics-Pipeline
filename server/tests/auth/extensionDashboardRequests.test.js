// What the extension dashboard sends (via background.js authorizedFetch) must pass
// the server's production CORS policy and auth middleware, while bad tokens and
// foreign origins stay rejected. Guards against "fixing" the dashboard by loosening
// the server instead of the extension.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-secret";
const auth = require("../../middleware/authMiddleware");
const { buildCorsOptions } = require("../../middleware/corsOptions");

const app = express();
app.use(cors(buildCorsOptions({ allowedOrigins: ["https://app.example.test"], nodeEnv: "production" })));
app.use(express.json());
app.get("/api/jobs", auth, (req, res) => res.json({ userId: req.user.id }));
app.use((err, req, res, next) => res.status(err.status || 500).json({ message: err.message }));

let server, url;
test.before(async () => { server = http.createServer(app); await new Promise((r) => server.listen(0, r)); url = `http://127.0.0.1:${server.address().port}/api/jobs`; });
test.after(() => server.close());

const EXT_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const access = (extra = {}) => jwt.sign({ id: 5, typ: "access", ...extra }, process.env.JWT_SECRET, { expiresIn: "15m" });
const dash = (headers) => fetch(url, { headers: { Origin: EXT_ORIGIN, "x-client": "extension", ...headers } });

test("dashboard request (extension origin + x-client + token header + access JWT) -> 200 with CORS for that origin", async () => {
  const r = await dash({ token: access() });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { userId: 5 });
  assert.equal(r.headers.get("access-control-allow-origin"), EXT_ORIGIN);
});

test("preflight for the dashboard's headers is accepted for the extension origin", async () => {
  const r = await fetch(url, { method: "OPTIONS", headers: { Origin: EXT_ORIGIN, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "token,x-client,content-type" } });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("access-control-allow-origin"), EXT_ORIGIN);
});

test("auth is NOT weakened: missing, garbage, refresh-typed and purpose tokens are all 401", async () => {
  assert.equal((await dash({})).status, 401);
  assert.equal((await dash({ token: "garbage" })).status, 401);
  assert.equal((await dash({ token: access({ typ: "refresh" }) })).status, 401);
  assert.equal((await dash({ token: access({ purpose: "password_reset" }) })).status, 401);
});

test("CORS is NOT loosened: a foreign web origin with a valid token gets 403 and no CORS headers", async () => {
  const r = await fetch(url, { headers: { Origin: "https://evil.test", "x-client": "extension", token: access() } });
  assert.equal(r.status, 403);
  assert.equal(r.headers.get("access-control-allow-origin"), null);
});
