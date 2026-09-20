import test from "node:test";
import assert from "node:assert/strict";

// Load the real background.js with a mocked chrome + fetch.
async function boot({ token = "jwt-abc", apiBaseUrl, webAppUrl, fetchImpl } = {}) {
  const store = { token, apiBaseUrl, webAppUrl };
  let listener;
  globalThis.chrome = {
    storage: { local: { get: async (k) => Object.fromEntries((Array.isArray(k) ? k : [k]).map((x) => [x, store[x]])), set: async () => {}, remove: async () => {} } },
    runtime: { onMessage: { addListener: (fn) => { listener = fn; } } },
  };
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return fetchImpl(url, init, calls); };
  await import(`../background.js?${Math.random()}`);
  const send = (message) => new Promise((resolve) => listener(message, {}, resolve));
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
  const { send, calls } = await boot({ token: null, fetchImpl: () => json(200, {}) });
  const r = await send({ type: "RESUME_ANALYZE", job: {} });
  assert.deepEqual([r.ok, r.code], [false, "not_logged_in"]);
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
