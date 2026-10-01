const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const cors = require("cors");
const { buildCorsOptions } = require("../../middleware/corsOptions");

function start(nodeEnv, allowedOrigins) {
  const app = express();
  app.use(cors(buildCorsOptions({ allowedOrigins, nodeEnv })));
  app.post("/x", (req, res) => res.json({ ok: true }));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ message: err.message }));
  const server = http.createServer(app);
  return new Promise((resolve) => server.listen(0, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/x` })));
}
const post = (url, headers = {}) => fetch(url, { method: "POST", headers });

test("production: allow-list unchanged (CLIENT_URL + chrome-extension), no CORS headers for others", async () => {
  const { server, url } = await start("production", ["https://app.example.test"]);
  try {
    const web = await post(url, { Origin: "https://app.example.test" });
    assert.equal(web.status, 200);
    assert.equal(web.headers.get("access-control-allow-origin"), "https://app.example.test");
    const ext = await post(url, { Origin: "chrome-extension://abcdef" });
    assert.equal(ext.status, 200);
    assert.equal(ext.headers.get("access-control-allow-origin"), "chrome-extension://abcdef");
  } finally { server.close(); }
});

test("production: a disallowed origin is 403 (not 500) and never receives CORS headers", async () => {
  const { server, url } = await start("production", ["https://app.example.test"]);
  try {
    const r = await post(url, { Origin: "https://evil.test" });
    assert.equal(r.status, 403);
    assert.equal(r.headers.get("access-control-allow-origin"), null);
    const pre = await fetch(url, { method: "OPTIONS", headers: { Origin: "https://evil.test", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-client,content-type" } });
    assert.equal(pre.headers.get("access-control-allow-origin"), null);
  } finally { server.close(); }
});

test("production: a request with NO Origin header (native app, curl) no longer crashes with 500 and gets no CORS headers", async () => {
  const { server, url } = await start("production", ["https://app.example.test"]);
  try {
    const r = await post(url);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("access-control-allow-origin"), null);
  } finally { server.close(); }
});

test("extension preflight for the custom x-client header is allowed", async () => {
  const { server, url } = await start("production", ["https://app.example.test"]);
  try {
    const pre = await fetch(url, { method: "OPTIONS", headers: { Origin: "chrome-extension://abcdef", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-client,token" } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get("access-control-allow-origin"), "chrome-extension://abcdef");
  } finally { server.close(); }
});
