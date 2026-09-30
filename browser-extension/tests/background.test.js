import test from "node:test";
import assert from "node:assert/strict";

// Load the real background.js with a mocked chrome + fetch.
async function boot({ token = "jwt-abc", refreshToken = "refresh-abc", apiBaseUrl, webAppUrl, fetchImpl } = {}) {
  const store = { apiBaseUrl, webAppUrl };
  const session = { accessToken: token, refreshToken, user: { id: 1, name: "Test" } };
  let listener;
  globalThis.chrome = {
    storage: {
      local: { get: async (k) => Object.fromEntries((Array.isArray(k) ? k : [k]).map((x) => [x, store[x]])), set: async () => {}, remove: async () => {} },
      session: { get: async (k) => Object.fromEntries((Array.isArray(k) ? k : [k]).map((x) => [x, session[x]])), set: async (v) => Object.assign(session, v), remove: async (ks) => { for (const k of ks) delete session[k]; } },
    },
    runtime: { onMessage: { addListener: (fn) => { listener = fn; } } },
  };
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return fetchImpl(url, init, calls); };
  await import(`../background.js?${Math.random()}`);
  const send = (message, sender = {}) => new Promise((resolve) => listener(message, sender, resolve));
  return { send, calls };
}
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

test("RESUME_ANALYZE forwards the job with the user's token to /api/resume/analyze — no AI keys anywhere", async () => {
  const { send, calls } = await boot({ fetchImpl: () => json(200, { matchScore: 70 }) });
  const r = await send({ type: "RESUME_ANALYZE", job: { title: "SWE", description: "x" } });
  assert.deepEqual(r, { ok: true, analysis: { matchScore: 70 } });
  assert.equal(calls[0].url, "https://job-application-tracker-portal-o1ls.onrender.com/api/resume/analyze");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.token, "jwt-abc");
  assert.deepEqual(JSON.parse(calls[0].init.body), { job: { title: "SWE", description: "x" } });
  assert.doesNotMatch(JSON.stringify(calls[0].init.headers), /api[-_]?key|authorization|sk-/i);
});

test("tailor / session / version messages map to the right endpoints", async () => {
  const { send, calls } = await boot({ apiBaseUrl: "http://localhost:5000/api/", fetchImpl: (url) => json(200, { url }) });
  await send({ type: "RESUME_TAILOR", job: { description: "d" } });
  await send({ type: "RESUME_SESSION", id: "abc-123" });
  await send({ type: "RESUME_VERSION", id: 7 });
  assert.deepEqual(calls.map((c) => [c.init.method, c.url]), [
    ["POST", "http://localhost:5000/api/resume/tailor"],
    ["GET", "http://localhost:5000/api/resume/sessions/abc-123"],
    ["GET", "http://localhost:5000/api/resume/tailored/7"],
  ]);
});

test("ids are URL-encoded (no path injection through a message)", async () => {
  const { send, calls } = await boot({ fetchImpl: () => json(200, {}) });
  await send({ type: "RESUME_SESSION", id: "../../auth/login" });
  assert.equal(calls[0].url.endsWith("/resume/sessions/..%2F..%2Fauth%2Flogin"), true);
});

test("not logged in: fails fast with a code and never calls the network", async () => {
  const { send, calls } = await boot({ token: null, refreshToken: null, fetchImpl: () => json(200, {}) });
  const r = await send({ type: "RESUME_ANALYZE", job: {} });
  assert.deepEqual([r.ok, r.code], [false, "session_expired"]);
  assert.match(r.error, /Not logged in/);
  assert.equal(calls.length, 0);
});

test("API error codes and messages are passed through to the panel", async () => {
  const { send } = await boot({ fetchImpl: () => json(422, { message: "Upload your resume before tailoring.", code: "no_resume" }) });
  assert.deepEqual(await send({ type: "RESUME_TAILOR", job: {} }), { ok: false, error: "Upload your resume before tailoring.", code: "no_resume" });
});

test("GET_WEB_URL: default and user override; existing messages still work", async () => {
  let b = await boot({ fetchImpl: () => json(200, {}) });
  assert.equal((await b.send({ type: "GET_WEB_URL" })).url, "https://job-application-tracker-portal-ten.vercel.app");
  b = await boot({ webAppUrl: "http://localhost:5173/", fetchImpl: () => json(200, {}) });
  assert.equal((await b.send({ type: "GET_WEB_URL" })).url, "http://localhost:5173");
  b = await boot({ fetchImpl: () => json(201, { id: 5, duplicate: false }) });
  const saved = await b.send({ type: "SAVE_JOB", job: { company: "A", role: "B" } });
  assert.deepEqual([saved.ok, saved.job.id], [true, 5]);
  assert.equal((await b.send({ type: "NOPE" })).ok, false);
});

test("SECURITY: every network request the extension makes goes to the TrackTrail API — never to an AI provider", async () => {
  const { send, calls } = await boot({ apiBaseUrl: "https://api.tracktrail.example/api", fetchImpl: () => json(200, { ok: true }) });
  const messages = [
    { type: "RESUME_ANALYZE", job: { description: "x" } }, { type: "RESUME_TAILOR", job: { description: "x" } },
    { type: "RESUME_SESSION", id: "s1" }, { type: "RESUME_VERSION", id: 3 }, { type: "GET_WEB_URL" },
    { type: "SAVE_JOB", job: { company: "A", role: "B" } },
  ];
  for (const m of messages) await send(m);
  assert.ok(calls.length >= 5);
  for (const c of calls) {
    assert.ok(c.url.startsWith("https://api.tracktrail.example/api/"), `unexpected request target: ${c.url}`);
    assert.doesNotMatch(c.url, /googleapis|groq|openrouter|anthropic|openai/i);
    assert.doesNotMatch(JSON.stringify(c.init.headers), /goog|api[-_]?key|authorization/i);
  }
});

// ---------------------------------------------------------------- hardening
test("5xx bodies are never shown; 429 keeps its code and retry hint; network failure is coded", async () => {
  let b = await boot({ fetchImpl: () => json(500, { message: "TypeError: cannot read properties of undefined at /srv/app.js:41" }) });
  let r = await b.send({ type: "SAVE_JOB", job: { company: "A", role: "B" } });
  assert.deepEqual([r.ok, r.code], [false, "server_error"]);
  assert.doesNotMatch(r.error, /TypeError|srv/);
  b = await boot({ fetchImpl: () => json(429, { message: "Too many requests.", code: "rate_limited", retryAfterSeconds: 12 }) });
  r = await b.send({ type: "SAVE_JOB", job: { company: "A", role: "B" } });
  assert.deepEqual([r.code, r.retryAfterSeconds], ["rate_limited", 12]);
  b = await boot({ fetchImpl: () => { throw new TypeError("Failed to fetch"); } });
  r = await b.send({ type: "GET_JOBS" });
  assert.deepEqual([r.ok, r.code], [false, "network"]);
});

test("GET_SESSION: an outage does NOT sign the user out; a rejected refresh does", async () => {
  let b = await boot({ fetchImpl: () => { throw new TypeError("offline"); } });
  let r = await b.send({ type: "GET_SESSION" });
  assert.deepEqual([r.ok, r.code], [false, "network"]);
  // 401 on /auth/me then the refresh endpoint is down (503): session must survive
  b = await boot({ fetchImpl: (url) => (url.endsWith("/auth/me") ? json(401, {}) : json(503, {})) });
  r = await b.send({ type: "GET_SESSION" });
  assert.equal(r.ok, false);
  // 401 then refresh definitively rejected (401): logged out, flagged as expired
  b = await boot({ fetchImpl: (url) => (url.endsWith("/auth/me") ? json(401, {}) : json(401, { message: "bad refresh" })) });
  r = await b.send({ type: "GET_SESSION" });
  assert.deepEqual([r.ok, r.loggedIn, r.expired], [true, false, true]);
});

test("concurrent 401s share ONE refresh (the refresh token rotates)", async () => {
  let refreshes = 0;
  const { send } = await boot({
    fetchImpl: (url, init) => {
      if (url.endsWith("/auth/refresh")) { refreshes += 1; return json(200, { accessToken: "new", refreshToken: "r2", user: { id: 1 } }); }
      return init.headers.token === "new" ? json(200, []) : json(401, {});
    },
  });
  const rs = await Promise.all([send({ type: "GET_JOBS" }), send({ type: "GET_JOBS" }), send({ type: "RESUME_LIST" })]);
  assert.ok(rs.every((r) => r.ok));
  assert.equal(refreshes, 1);
});

test("API_REQUEST is refused for content scripts (sender.tab) and non-absolute paths", async () => {
  const { send, calls } = await boot({ fetchImpl: () => json(200, {}) });
  const viaTab = await send({ type: "API_REQUEST", path: "/jobs" }, { tab: { id: 3 } });
  assert.deepEqual([viaTab.ok, viaTab.code], [false, "forbidden"]);
  assert.equal((await send({ type: "API_REQUEST", path: "/jobs" })).ok, true); // extension pages still work
  calls.length = 0;
  const r = await send({ type: "API_REQUEST", path: "http://evil.example/x" });
  assert.deepEqual([r.ok, r.code], [false, "forbidden"]);
  assert.equal(calls.length, 0);
});

test("mutations are never silently replayed after a session refresh", async () => {
  const { send, calls } = await boot({
    fetchImpl: (url, init) => {
      if (url.endsWith("/auth/refresh")) return json(200, { accessToken: "new", refreshToken: "r2", user: {} });
      return init.headers.token === "new" ? json(201, { id: 1 }) : json(401, {});
    },
  });
  const r = await send({ type: "RESUME_TAILOR", job: { description: "x" } });
  assert.deepEqual([r.ok, r.code], [false, "session_restored"]);
  assert.equal(calls.filter((c) => c.url.endsWith("/resume/tailor")).length, 1);
});
