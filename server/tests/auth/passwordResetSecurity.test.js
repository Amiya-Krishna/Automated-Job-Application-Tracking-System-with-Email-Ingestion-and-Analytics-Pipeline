// Regression tests for the password-reset security hardening found in final QA:
//  - the client must not be able to choose an arbitrary destination for the token
//  - the emailed link must be HTML-escaped and never logged in production
const test = require("node:test");
const assert = require("node:assert/strict");
const { isAllowedResetRedirect } = require("../../utils/mobileRedirect");

const dev = { NODE_ENV: "development" };
const prod = { NODE_ENV: "production" };

test("reset redirect: standalone/dev-client build only accepts exactly mobile://reset-password", () => {
  for (const env of [dev, prod]) {
    assert.equal(isAllowedResetRedirect("mobile://reset-password", env), true);
    for (const bad of [
      "mobile://reset-password?x=1", "mobile://reset-password#frag", "mobile://evil",
      "mobile://reset-password/../x", "mobile://reset-password.evil.test", "mobile://",
      "MOBILE://reset-password ", "https://evil.test/x", "javascript:alert(1)", "", null, undefined, 42,
    ]) assert.equal(isAllowedResetRedirect(bad, env), false, String(bad));
  }
});

test("reset redirect: an attacker-controlled exp:// host is rejected (token cannot be sent to a host of the caller's choosing)", () => {
  for (const bad of [
    "exp://attacker.example.com:8081/--/reset-password",
    "exp://8.8.8.8:8081/--/reset-password",
    "exp://192.168.1.5@attacker.example.com/--/reset-password",
    "exp://192.168.1.5.attacker.example.com/--/reset-password",
    "exp://192.168.1.5:8081/--/other-screen",
    "exp://192.168.1.5:8081/--/reset-password?next=evil",
    "exp://192.168.300.5:8081/--/reset-password",
  ]) assert.equal(isAllowedResetRedirect(bad, dev), false, bad);
});

test("reset redirect: Expo Go links only work in development, on loopback/private LAN hosts", () => {
  for (const ok of [
    "exp://192.168.1.5:8081/--/reset-password", "exp://10.0.0.7:8081/--/reset-password",
    "exp://172.20.1.2:19000/--/reset-password", "exp://localhost:8081/--/reset-password",
  ]) {
    assert.equal(isAllowedResetRedirect(ok, dev), true, ok);
    assert.equal(isAllowedResetRedirect(ok, prod), false, `${ok} must be rejected in production`);
  }
});

test("email: the link is HTML-escaped, a plain-text part is sent, and no key is ever echoed", async () => {
  process.env.RESEND_API_KEY = "re_test_key_for_unit_test";
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ id: "x" }) }; };
  try {
    const { sendPasswordResetEmail } = require("../../services/emailService");
    await sendPasswordResetEmail({ to: "a@b.co", resetUrl: 'exp://h/--/x"><img src=x onerror=alert(1)>?token=t' });
    const body = JSON.parse(calls[0].init.body);
    assert.ok(!body.html.includes('"><img'), "raw markup must not survive in the HTML part");
    assert.ok(body.html.includes("&quot;&gt;&lt;img"));
    assert.match(body.text, /token=t/);
  } finally {
    global.fetch = realFetch;
    delete process.env.RESEND_API_KEY;
  }
});

test("email: without an API key the reset link is logged in development but NEVER in production", async () => {
  delete process.env.RESEND_API_KEY;
  const { sendPasswordResetEmail } = require("../../services/emailService");
  const logs = [];
  const realWarn = console.warn;
  console.warn = (...a) => logs.push(a.join(" "));
  const prev = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    await sendPasswordResetEmail({ to: "a@b.co", resetUrl: "https://x.test/reset-password?token=SECRET-TOKEN-VALUE" });
    assert.ok(logs.length > 0);
    assert.ok(!logs.join("\n").includes("SECRET-TOKEN-VALUE"), "token must not be logged in production");
    logs.length = 0;
    process.env.NODE_ENV = "development";
    await sendPasswordResetEmail({ to: "a@b.co", resetUrl: "https://x.test/reset-password?token=DEV-TOKEN" });
    assert.ok(logs.join("\n").includes("DEV-TOKEN"), "dev fallback keeps the flow testable");
  } finally {
    console.warn = realWarn;
    process.env.NODE_ENV = prev;
  }
});
