import test from "node:test";
import assert from "node:assert/strict";

const EXT_ID = "abcdefghijklmnopabcdefghijklmnop";
const API = "https://job-application-tracker-portal-o1ls.onrender.com";
const GOOGLE_URL = "https://accounts.google.com/o/oauth2/v2/auth?state=signed-state";
const dashboardUrl = `chrome-extension://${EXT_ID}/dashboard.html?gmail=connected`;
const dashboardSender = {
  id: EXT_ID,
  url: `chrome-extension://${EXT_ID}/dashboard.html#emailTab`,
  tab: { id: 42, windowId: 1, index: 2 },
};
const externalSender = {
  url: `${API}/extension/gmail-success.html?gmail=connected&extensionId=${EXT_ID}`,
  tab: { id: 42, windowId: 1, index: 2 },
};
const contentScriptSender = {
  id: EXT_ID,
  url: "https://www.linkedin.com/jobs/view/1",
  tab: { id: 3, windowId: 1, index: 0 },
};

async function boot({ authUrl = GOOGLE_URL } = {}) {
  const session = { accessToken: "jwt-abc", refreshToken: "refresh-abc", user: { id: 1, name: "Test" } };
  const store = {};
  const sent = [];
  const calls = [];
  let onMessage;
  let onMessageExternal;

  globalThis.chrome = {
    storage: {
      local: { get: async () => ({}), set: async () => {}, remove: async () => {} },
      session: {
        get: async (k) => Object.fromEntries((Array.isArray(k) ? k : [k]).map((x) => [x, store[x] ?? session[x]])),
        set: async (v) => Object.assign(store, v),
        remove: async (ks) => { for (const k of ks) delete store[k]; },
      },
    },
    tabs: {
      update: async (tabId, details) => { calls.push({ type: "tabs.update", tabId, details }); return { id: tabId }; },
    },
    runtime: {
      id: EXT_ID,
      getURL: (p = "") => `chrome-extension://${EXT_ID}/${p}`,
      onMessage: { addListener: (fn) => { onMessage = fn; } },
      onMessageExternal: { addListener: (fn) => { onMessageExternal = fn; } },
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
  const external = (message, sender) => new Promise((resolve) => onMessageExternal(message, sender, resolve));
  return { send, external, calls, session, store, sent };
}

test("Connect navigates the existing extension tab to Google — no popup/new tab", async () => {
  const t = await boot();
  const r = await t.send({ type: "GMAIL_CONNECT" }, dashboardSender);
  assert.equal(r.ok, true);
  assert.equal(r.status, "started");

  const nav = t.calls.find((c) => c.type === "tabs.update");
  assert.equal(nav.tabId, 42);
  assert.deepEqual(nav.details, { url: GOOGLE_URL, active: true });
  assert.equal(t.calls.filter((c) => c.type === "tabs.update").length, 1);
  assert.equal(t.store.gmailFlow.tabId, 42);
});

test("Server completion returns the SAME tab to the extension dashboard", async () => {
  const t = await boot();
  await t.send({ type: "GMAIL_CONNECT" }, dashboardSender);
  const r = await t.external({ type: "TRACKTRAIL_GMAIL_OAUTH_COMPLETE", status: "connected" }, externalSender);
  assert.deepEqual(r, { ok: true });
  const nav = t.calls.filter((c) => c.type === "tabs.update").at(-1);
  assert.equal(nav.tabId, 42);
  assert.equal(nav.details.url, dashboardUrl);
  assert.equal(t.store.gmailFlow, undefined);
});

test("External completion is rejected from an untrusted origin", async () => {
  const t = await boot();
  await t.send({ type: "GMAIL_CONNECT" }, dashboardSender);
  t.external(
    { type: "TRACKTRAIL_GMAIL_OAUTH_COMPLETE", status: "connected" },
    { ...externalSender, url: "https://evil.example/extension/gmail-success.html" },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(t.calls.filter((c) => c.type === "tabs.update").length, 1);
  assert.ok(t.store.gmailFlow);
});

test("Content scripts cannot start Gmail OAuth", async () => {
  const t = await boot();
  const r = await t.send({ type: "GMAIL_CONNECT" }, contentScriptSender);
  assert.deepEqual([r.ok, r.code], [false, "forbidden"]);
  assert.equal(t.calls.length, 0);
});

test("A non-Google auth URL is rejected before navigation", async () => {
  const t = await boot({ authUrl: "https://evil.example/phish" });
  const r = await t.send({ type: "GMAIL_CONNECT" }, dashboardSender);
  assert.equal(r.ok, false);
  assert.equal(r.code, "bad_auth_url");
  assert.equal(t.calls.filter((c) => c.type === "tabs.update").length, 0);
});
