import test from "node:test";
import assert from "node:assert/strict";

const EXT_ID = "abcdefghijklmnopabcdefghijklmnop";
const API = "https://job-application-tracker-portal-o1ls.onrender.com";
const REDIRECT = `https://${EXT_ID}.chromiumapp.org/gmail`;
const GOOGLE_URL = "https://accounts.google.com/o/oauth2/v2/auth?state=signed-state";

const dashboardSender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/dashboard.html#emailTab` };
const contentScriptSender = { id: EXT_ID, url: "https://www.linkedin.com/jobs/view/1", tab: { id: 3, windowId: 1, index: 0 } };

async function boot({ authUrl = GOOGLE_URL, oauthResult = `${REDIRECT}?gmail=connected`, oauthError = null } = {}) {
  const session = { accessToken: "jwt-abc", refreshToken: "refresh-abc", user: { id: 1, name: "Test" } };
  const store = {};
  const sent = [];
  let onMessage;
  const calls = [];

  globalThis.chrome = {
    storage: {
      local: { get: async () => ({}), set: async () => {}, remove: async () => {} },
      session: {
        get: async (k) => Object.fromEntries((Array.isArray(k) ? k : [k]).map((x) => [x, store[x] ?? session[x]])),
        set: async (v) => Object.assign(store, v),
        remove: async (ks) => { for (const k of ks) delete store[k]; },
      },
    },
    identity: {
      getRedirectURL: (path = "") => `${REDIRECT.replace(/\/gmail$/, "")}${path ? `/${path}` : "/gmail"}`,
      launchWebAuthFlow: async ({ url, interactive }) => {
        assert.equal(url, GOOGLE_URL);
        assert.equal(interactive, true);
        if (oauthError) throw new Error(oauthError);
        return oauthResult;
      },
    },
    runtime: {
      id: EXT_ID,
      getURL: (p = "") => `chrome-extension://${EXT_ID}/${p}`,
      onMessage: { addListener: (fn) => { onMessage = fn; } },
      sendMessage: async (m) => { sent.push(m); },
    },
  };

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (String(url).includes("/gmail/auth-url")) return { ok: true, status: 200, json: async () => ({ url: authUrl }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };

  await import(`../background.js?${Math.random()}`);
  const send = (message, sender) => new Promise((resolve) => onMessage(message, sender, resolve));
  return { send, calls, session, store, sent };
}

test("Connect from the dashboard uses Chrome Identity OAuth and opens no browser tab", async () => {
  const t = await boot();
  const r = await t.send({ type: "GMAIL_CONNECT" }, dashboardSender);
  assert.equal(r.ok, true);
  assert.equal(r.status, "connected");
  assert.equal(t.sent.at(-1).status, "connected");
  assert.equal(t.calls.find((c) => c.url.includes("/gmail/auth-url")).url, `${API}/api/gmail/auth-url?source=extension&redirectUri=${encodeURIComponent(REDIRECT)}`);
  assert.equal(t.calls.find((c) => c.url.includes("/gmail/auth-url")).init.headers.token, "jwt-abc");
  assert.equal(t.store.gmailFlow, undefined);
});

test("OAuth result must come from the exact Chrome Identity redirect URL", async () => {
  const t = await boot({ oauthResult: "https://evil.example/callback?gmail=connected" });
  const r = await t.send({ type: "GMAIL_CONNECT" }, dashboardSender);
  assert.equal(r.ok, false);
  assert.equal(r.code, "oauth_failed");
  assert.deepEqual(t.sent, []);
});

test("OAuth error/cancellation does not claim Gmail is connected", async () => {
  const t = await boot({ oauthError: "User canceled the sign-in" });
  const r = await t.send({ type: "GMAIL_CONNECT" }, dashboardSender);
  assert.equal(r.ok, true);
  assert.equal(r.status, "cancelled");
  assert.equal(t.sent.at(-1).status, "cancelled");
});

test("Unexpected Gmail status is treated as an error", async () => {
  const t = await boot({ oauthResult: `${REDIRECT}?gmail=bogus` });
  const r = await t.send({ type: "GMAIL_CONNECT" }, dashboardSender);
  assert.equal(r.ok, true);
  assert.equal(r.status, "error");
  assert.equal(t.sent.at(-1).status, "error");
});

test("Content scripts cannot start Gmail OAuth", async () => {
  const t = await boot();
  const r = await t.send({ type: "GMAIL_CONNECT" }, contentScriptSender);
  assert.deepEqual([r.ok, r.code], [false, "forbidden"]);
  assert.equal(t.calls.length, 0);
});

test("A non-Google auth URL is rejected before Chrome Identity starts", async () => {
  const t = await boot({ authUrl: "https://evil.example/phish" });
  const r = await t.send({ type: "GMAIL_CONNECT" }, dashboardSender);
  assert.equal(r.ok, false);
  assert.equal(r.code, "bad_auth_url");
  assert.deepEqual(t.sent, []);
});
