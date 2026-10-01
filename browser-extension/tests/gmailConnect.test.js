import test from "node:test";
import assert from "node:assert/strict";

// Real background.js with a mocked chrome (tabs, windows, runtime messaging) + fetch.
const EXT_ID = "abcdefghijklmnopabcdefghijklmnop";
const API = "https://job-application-tracker-portal-o1ls.onrender.com";
const LANDING = `${API}/extension/gmail-success.html`;
const GOOGLE_URL = "https://accounts.google.com/o/oauth2/v2/auth?state=signed-state";

const dashboardSender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/dashboard.html#emailTab`, tab: { id: 42, windowId: 7, index: 2 } };
const contentScriptSender = { id: EXT_ID, url: "https://www.linkedin.com/jobs/view/1", tab: { id: 3, windowId: 1, index: 0 } };

async function boot({ authUrl = GOOGLE_URL, originTabAlive = true } = {}) {
  const session = { accessToken: "jwt-abc", refreshToken: "refresh-abc", user: { id: 1, name: "Test" } };
  const store = {};
  const created = [], updated = [], removed = [], windowUpdates = [], sent = [];
  const openTabs = new Set([42]);
  let nextTabId = 99;
  let onMessage, onUpdated, onRemoved;
  globalThis.chrome = {
    storage: {
      local: { get: async (k) => Object.fromEntries((Array.isArray(k) ? k : [k]).map((x) => [x, store[x]])), set: async () => {}, remove: async () => {} },
      session: {
        get: async (k) => Object.fromEntries((Array.isArray(k) ? k : [k]).map((x) => [x, session[x]])),
        set: async (v) => Object.assign(session, v),
        remove: async (ks) => { for (const k of ks) delete session[k]; },
      },
    },
    runtime: {
      id: EXT_ID,
      getURL: (p = "") => `chrome-extension://${EXT_ID}/${p}`,
      onMessage: { addListener: (fn) => { onMessage = fn; } },
      sendMessage: async (m) => { sent.push(m); },
    },
    tabs: {
      create: async (o) => { const t = { id: nextTabId++, ...o }; created.push(o); openTabs.add(t.id); return t; },
      get: async (id) => { if (!openTabs.has(id)) throw new Error("No tab"); return { id, windowId: 7 }; },
      update: async (id, o) => { updated.push([id, o]); if (id === 42 && !originTabAlive) throw new Error("No tab with id 42"); if (!openTabs.has(id)) throw new Error("No tab"); return { id }; },
      remove: async (id) => { removed.push(id); openTabs.delete(id); },
      onUpdated: { addListener: (fn) => { onUpdated = fn; } },
      onRemoved: { addListener: (fn) => { onRemoved = fn; } },
    },
    windows: { update: async (id, o) => { windowUpdates.push([id, o]); } },
  };
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (String(url).includes("/gmail/auth-url")) return { ok: true, status: 200, json: async () => ({ url: authUrl }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  await import(`../background.js?${Math.random()}`);
  const send = (message, sender) => new Promise((resolve) => onMessage(message, sender, resolve));
  const tick = () => new Promise((r) => setTimeout(r, 20));
  return {
    send, calls, session, created, updated, removed, windowUpdates, sent, tick,
    fireUpdated: async (tabId, url) => { onUpdated(tabId, { url }, { id: tabId, url }); await tick(); },
    fireRemoved: async (tabId) => { openTabs.delete(tabId); onRemoved(tabId, {}); await tick(); },
  };
}

test("Connect from the dashboard tab opens ONE Google tab next to it and remembers where to return", async () => {
  const t = await boot();
  const r = await t.send({ type: "GMAIL_CONNECT" }, dashboardSender);
  assert.equal(r.ok, true);
  const authCall = t.calls.find((c) => c.url.includes("/gmail/auth-url"));
  assert.equal(authCall.url, `${API}/api/gmail/auth-url?source=extension`);
  assert.equal(authCall.init.headers.token, "jwt-abc");
  assert.equal(authCall.init.headers["x-client"], "extension");
  assert.equal(t.created.length, 1);
  assert.deepEqual(t.created[0], { url: GOOGLE_URL, active: true, windowId: 7, openerTabId: 42, index: 3 });
  assert.deepEqual({ ...t.session.gmailFlow, startedAt: 0 }, { oauthTabId: 99, originTabId: 42, originWindowId: 7, landingOrigin: API, startedAt: 0 });
});

test("OAuth succeeds -> OAuth tab is closed, the SAME dashboard tab is refocused (not navigated), session intact, result 'connected'", async () => {
  const t = await boot();
  await t.send({ type: "GMAIL_CONNECT" }, dashboardSender);
  const before = { accessToken: t.session.accessToken, refreshToken: t.session.refreshToken, user: t.session.user };

  await t.fireUpdated(99, `${LANDING}?gmail=connected`);

  assert.deepEqual(t.removed, [99]);
  assert.deepEqual(t.updated, [[42, { active: true }]]);          // focus only: no url => no navigation => no reload, no 'Blocked'
  assert.deepEqual(t.windowUpdates, [[7, { focused: true }]]);
  assert.equal(t.created.length, 1);                                // no extra tab was created for the return
  assert.deepEqual(t.sent, [{ type: "GMAIL_CONNECT_RESULT", status: "connected" }]);
  assert.equal(t.session.gmailFlow, undefined);                     // flow finished
  assert.deepEqual({ accessToken: t.session.accessToken, refreshToken: t.session.refreshToken, user: t.session.user }, before); // extension session untouched
  assert.ok(!t.calls.some((c) => /\/auth\/(login|refresh|logout)/.test(c.url)), "no auth/session call happened");
});

test("a failed or incomplete OAuth is reported as such, never as connected", async () => {
  for (const [raw, expected] of [["error", "error"], ["no_refresh_token", "no_refresh_token"], ["bogus", "error"], [null, "error"]]) {
    const t = await boot();
    await t.send({ type: "GMAIL_CONNECT" }, dashboardSender);
    await t.fireUpdated(99, raw === null ? LANDING : `${LANDING}?gmail=${raw}`);
    assert.equal(t.sent.at(-1).status, expected, String(raw));
  }
});

test("if the originating tab is gone, the Email tab is opened once instead (no duplicate tabs)", async () => {
  const t = await boot({ originTabAlive: false });
  await t.send({ type: "GMAIL_CONNECT" }, dashboardSender);
  await t.fireUpdated(99, `${LANDING}?gmail=connected`);
  assert.equal(t.created.length, 2);
  assert.equal(t.created[1].url, `chrome-extension://${EXT_ID}/dashboard.html#emailTab`);
  assert.equal(t.sent.at(-1).status, "connected");
});

test("only the API server's landing page, in the OAuth tab, completes the flow", async () => {
  const t = await boot();
  await t.send({ type: "GMAIL_CONNECT" }, dashboardSender);
  await t.fireUpdated(99, "https://accounts.google.com/signin/oauth/consent");               // still at Google
  await t.fireUpdated(99, `https://evil.example/extension/gmail-success.html?gmail=connected`); // wrong origin
  await t.fireUpdated(99, `${API}/api/gmail/callback?code=x&state=y`);                         // not the landing page
  await t.fireUpdated(99, `${API}/extension/gmail-success.html.evil?gmail=connected`);          // wrong path
  await t.fireUpdated(500, `${LANDING}?gmail=connected`);                                      // some other tab
  assert.deepEqual(t.removed, []);
  assert.deepEqual(t.sent, []);
  assert.ok(t.session.gmailFlow, "flow still pending");
});

test("closing the Google tab cancels the flow and returns to the dashboard without claiming success", async () => {
  const t = await boot();
  await t.send({ type: "GMAIL_CONNECT" }, dashboardSender);
  await t.fireRemoved(99);
  assert.deepEqual(t.sent, [{ type: "GMAIL_CONNECT_RESULT", status: "cancelled" }]);
  assert.deepEqual(t.updated, [[42, { active: true }]]);
  assert.equal(t.session.gmailFlow, undefined);
});

test("clicking Connect again while the Google tab is open refocuses it instead of opening another", async () => {
  const t = await boot();
  await t.send({ type: "GMAIL_CONNECT" }, dashboardSender);
  const again = await t.send({ type: "GMAIL_CONNECT" }, dashboardSender);
  assert.equal(again.reused, true);
  assert.equal(t.created.length, 1);
  assert.deepEqual(t.updated.at(-1), [99, { active: true }]);
});

test("security: content scripts cannot start OAuth; a non-Google auth URL is never opened", async () => {
  const t = await boot();
  const r = await t.send({ type: "GMAIL_CONNECT" }, contentScriptSender);
  assert.deepEqual([r.ok, r.code], [false, "forbidden"]);
  assert.equal(t.calls.length, 0);
  assert.equal(t.created.length, 0);

  const bad = await boot({ authUrl: "https://evil.example/phish" });
  const r2 = await bad.send({ type: "GMAIL_CONNECT" }, dashboardSender);
  assert.equal(r2.ok, false);
  assert.equal(bad.created.length, 0);
  assert.equal(bad.session.gmailFlow, undefined);
});

test("popup (no tab) can start OAuth; completion opens the Email tab once", async () => {
  const t = await boot();
  const popup = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/popup.html` };
  assert.equal((await t.send({ type: "GMAIL_CONNECT" }, popup)).ok, true);
  assert.deepEqual(t.created[0], { url: GOOGLE_URL, active: true });
  await t.fireUpdated(99, `${LANDING}?gmail=connected`);
  assert.equal(t.created.at(-1).url, `chrome-extension://${EXT_ID}/dashboard.html#emailTab`);
});
