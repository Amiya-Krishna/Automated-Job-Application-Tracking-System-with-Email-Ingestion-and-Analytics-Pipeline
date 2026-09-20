const test = require("node:test");
const assert = require("node:assert/strict");
const { createProvider, FallbackProvider, GeminiAdapter, GroqAdapter, OpenRouterAdapter } = require("../../services/resumeTailoring/providers");
const { ProviderError } = require("../../services/resumeTailoring/providers/errors");
const { parseResume } = require("../../services/resumeTailoring/resumeParser");
const { analyzeJobDescription } = require("../../services/resumeTailoring/jdAnalyzer");
const { matchRequirements } = require("../../services/resumeTailoring/matcher");
const { buildTailoring, resolveProfile, verifyResult } = require("../../services/resumeTailoring/engine");
const { toText } = require("../../services/resumeTailoring/resumeRenderer");
const { KEY, res, mockFetch, PAYLOAD, REQUEST, VENDORS, makeAdapter } = require("./providerMocks");
const { startApp, LONG_TAIL } = require("./helpers");
const fx = require("./fixtures");

const [G, Q, O] = VENDORS; // gemini, groq, openrouter
const KEYS = { gemini: "GEMINI-KEY-aaaaaaaaaa", groq: "GROQ-KEY-bbbbbbbbbbb", openrouter: "OPENROUTER-KEY-cccccc" };

/** Build a fallback chain of real adapters over mocked HTTP; returns provider + per-vendor call logs. */
function chain(specs, opts = {}) {
  const logs = [];
  const logger = { info: (l) => logs.push(l), warn: (l) => logs.push(l) };
  const calls = {};
  const providers = specs.map(([v, steps]) => {
    const m = mockFetch(steps);
    calls[v.id] = m.calls;
    return new v.Adapter({ apiKey: KEYS[v.id], model: v.model, fetchImpl: m.fetchImpl, sleepImpl: async () => {}, logger, timeoutMs: 30, maxRetries: opts.maxRetries ?? 1 });
  });
  return { provider: new FallbackProvider(providers, { logger }), calls, logs };
}

test("Gemini -> Groq: falls back on rate limit (after primary retries) and reports who served", async () => {
  const { provider, calls } = chain([[G, [res(429, {})]], [Q, [Q.ok()]]]);
  const out = await provider.generateTailoring(REQUEST);
  assert.deepEqual(out.rewrites, PAYLOAD.rewrites);
  assert.deepEqual(out.servedBy, { name: "groq", model: Q.model });
  assert.equal(out.fallbackUsed, true);
  assert.equal(calls.gemini.length, 2, "primary retried before falling back (1 attempt + 1 retry)");
  assert.equal(calls.groq.length, 1);
  assert.deepEqual(out.attempts.map((a) => [a.provider, a.category]), [["gemini", "rate_limit"]]);
});

test("Groq -> OpenRouter: falls back on 5xx", async () => {
  const { provider, calls } = chain([[Q, [res(503, {})]], [O, [O.ok()]]]);
  const out = await provider.generateTailoring(REQUEST);
  assert.equal(out.servedBy.name, "openrouter");
  assert.equal(calls.groq.length, 2);
  assert.equal(calls.openrouter.length, 1);
});

test("falls back on timeout and on network errors", async () => {
  for (const step of ["hang", new Error("ECONNREFUSED")]) {
    const { provider, calls } = chain([[G, [step]], [Q, [Q.ok()]]]);
    const out = await provider.generateTailoring(REQUEST);
    assert.equal(out.fallbackUsed, true);
    assert.equal(calls.groq.length, 1);
  }
});

test("primary success: fallback provider is never contacted", async () => {
  const { provider, calls } = chain([[G, [G.ok()]], [Q, [Q.ok()]]]);
  const out = await provider.generateTailoring(REQUEST);
  assert.equal(out.fallbackUsed, false);
  assert.equal(out.servedBy.name, "gemini");
  assert.equal(calls.groq.length, 0);
});

test("three-level chain Gemini -> Groq -> OpenRouter, and total failure throws the last error with attempts", async () => {
  let c = chain([[G, [res(500, {})]], [Q, [res(429, {})]], [O, [O.ok()]]]);
  assert.equal((await c.provider.generateTailoring(REQUEST)).servedBy.name, "openrouter");
  c = chain([[G, [res(500, {})]], [Q, [res(429, {})]], [O, [res(502, {})]]]);
  await assert.rejects(c.provider.generateTailoring(REQUEST), (e) => e instanceof ProviderError && e.category === "server" && e.attempts.length === 3);
});

test("NO fallback for auth, config, malformed/schema output, or provider safety blocks — the second vendor is never called", async () => {
  const cases = {
    "HTTP 400": [res(400, {})], "HTTP 401": [res(401, {})], "HTTP 403": [res(403, {})], "HTTP 404": [res(404, {})],
    "malformed JSON": [G.text("{not json")], "prose": [G.text("Sure! " + JSON.stringify(PAYLOAD))],
    "schema mismatch": [G.ok({ rewrites: "nope" })],
    "safety block": [res(200, { promptFeedback: { blockReason: "SAFETY" } })],
  };
  for (const [name, steps] of Object.entries(cases)) {
    const { provider, calls } = chain([[G, steps], [Q, [Q.ok()]]]);
    await assert.rejects(provider.generateTailoring(REQUEST), (e) => e instanceof ProviderError && !e.fallbackEligible, name);
    assert.equal(calls.groq.length, 0, `${name}: must NOT fall back`);
  }
});

test("API keys are never crossed between vendors", async () => {
  const { provider, calls } = chain([[G, [res(500, {})]], [Q, [res(500, {})]], [O, [O.ok()]]]);
  await provider.generateTailoring(REQUEST);
  const seen = (arr) => arr.map((c) => JSON.stringify([c.url, c.init.headers, c.init.body])).join("|");
  assert.ok(seen(calls.gemini).includes(KEYS.gemini) && !seen(calls.gemini).includes(KEYS.groq) && !seen(calls.gemini).includes(KEYS.openrouter));
  assert.ok(seen(calls.groq).includes(KEYS.groq) && !seen(calls.groq).includes(KEYS.gemini));
  assert.ok(seen(calls.openrouter).includes(KEYS.openrouter) && !seen(calls.openrouter).includes(KEYS.gemini) && !seen(calls.openrouter).includes(KEYS.groq));
});

test("fallback events are logged without content or keys", async () => {
  const { provider, logs } = chain([[G, [res(429, {})]], [Q, [Q.ok()]]]);
  await provider.generateTailoring(REQUEST);
  const fb = logs.map((l) => JSON.parse(l.replace("[ai] ", ""))).find((l) => l.evt === "ai_fallback");
  assert.deepEqual([fb.from, fb.to, fb.reason], ["gemini", "groq", "rate_limit"]);
  for (const l of logs) for (const k of Object.values(KEYS)) assert.ok(!l.includes(k));
});

// -------------------------------------------------------------- factory
test("factory builds the chain from env, keeps fallback keys separate, and degrades safely", () => {
  const base = { AI_PROVIDER: "gemini", AI_API_KEY: KEYS.gemini, AI_MODEL: "gm" };
  const p = createProvider({ ...base, AI_FALLBACK_PROVIDER: "groq", AI_FALLBACK_API_KEY: KEYS.groq, AI_FALLBACK_MODEL: "qm", AI_LOG_LEVEL: "silent" });
  assert.ok(p instanceof FallbackProvider);
  assert.deepEqual(p.chain.map((x) => [x.constructor.name, x.name, x.model]), [["GeminiAdapter", "gemini", "gm"], ["GroqAdapter", "groq", "qm"]]);
  assert.equal(p.chain[1].apiKey, KEYS.groq);
  // different vendor without its own key: no fallback (primary key is NEVER reused for another vendor)
  const noKey = createProvider({ ...base, AI_FALLBACK_PROVIDER: "groq", AI_FALLBACK_MODEL: "qm", AI_LOG_LEVEL: "silent" });
  assert.ok(noKey instanceof GeminiAdapter);
  assert.match(noKey.configNote, /AI_FALLBACK_API_KEY or AI_FALLBACK_MODEL is missing.*without a fallback/);
  // same vendor, different model: primary key may be reused
  const same = createProvider({ ...base, AI_FALLBACK_PROVIDER: "gemini", AI_FALLBACK_MODEL: "gm-lite", AI_LOG_LEVEL: "silent" });
  assert.equal(same.chain[1].apiKey, KEYS.gemini);
  // unknown / unsafe fallback config never crashes or disables the primary
  assert.match(createProvider({ ...base, AI_FALLBACK_PROVIDER: "wat", AI_LOG_LEVEL: "silent" }).configNote, /Unknown AI_FALLBACK_PROVIDER/);
  assert.match(createProvider({ ...base, AI_FALLBACK_PROVIDER: "openrouter", AI_FALLBACK_API_KEY: "k".repeat(10), AI_FALLBACK_MODEL: "m", AI_FALLBACK_BASE_URL: "http://evil.example/v1", AI_LOG_LEVEL: "silent" }).configNote, /https/);
  // provider "none" with a fallback configured stays deterministic
  assert.equal(createProvider({ AI_PROVIDER: "none", AI_FALLBACK_PROVIDER: "groq" }).usesLLM, false);
  // all supported values select the right adapter
  for (const [id, cls] of [["gemini", GeminiAdapter], ["groq", GroqAdapter], ["openrouter", OpenRouterAdapter]]) {
    assert.ok(createProvider({ AI_PROVIDER: id, AI_API_KEY: "k".repeat(10), AI_MODEL: "m", AI_LOG_LEVEL: "silent" }) instanceof cls, id);
  }
});

// -------- the fallback answer goes through EXACTLY the same validation pipeline
async function pipeline(provider, resume = fx.MINIMAL_REACT_RESUME) {
  const { profile, facts } = parseResume(resume);
  const jdr = analyzeJobDescription({ title: "Frontend Developer", company: "Acme", description: fx.SAFETY_JD + LONG_TAIL });
  const match = matchRequirements(jdr.requirements, facts);
  const t = await buildTailoring({ profile, facts, match, resumeText: resume, provider });
  const { profile: out, applied } = resolveProfile(profile, t.changes, { include: ["pending"] });
  const verdict = verifyResult({ source: profile, result: out, applied, resumeText: resume, forbiddenTerms: t.forbiddenTerms });
  return { t, verdict, text: toText(out) };
}
const evilAnswer = (v) => (req) => v.ok({ rewrites: req.units.map((u) => ({ unitId: u.id, proposed: "Built React applications on AWS with Docker for 1M users." })) });

test("a FABRICATED answer from the fallback provider is rejected by evidence validation like any other", async () => {
  const bodyFor = (v) => (url, init) => v.ok({ rewrites: JSON.parse(v.userOf(JSON.parse(init.body))).units.map((u) => ({ unitId: u.unitId, proposed: "Built React applications on AWS with Docker for 1M users." })) });
  const { provider, calls } = chain([[G, [res(503, {})]], [Q, [bodyFor(Q)]]]);
  const r = await pipeline(provider);
  assert.ok(calls.groq.length >= 1, "the fallback really answered");
  assert.equal(r.t.aiServedBy.name, "groq");
  assert.equal(r.t.aiFallbackUsed, true);
  assert.ok(r.t.unsupportedClaims.length >= 1);
  assert.equal(r.t.changes.filter((c) => c.source === "ai").length, 0);
  assert.equal(r.verdict.ok, true);
  assert.doesNotMatch(r.text, /AWS|Docker|1M|Built React applications on/);
  assert.match(r.text, /Built React applications\./);
});

test("a schema-invalid answer from the fallback is never accepted (no unvalidated response can reach the engine)", async () => {
  const { provider } = chain([[G, [res(500, {})]], [Q, [Q.text("Sure! I added AWS experience.")]]]);
  const r = await pipeline(provider);
  assert.equal(r.t.aiStatus, "failed");
  assert.ok(r.t.warnings.some((w) => /unavailable/.test(w)));
  assert.equal(r.t.changes.filter((c) => c.source === "ai").length, 0);
  assert.doesNotMatch(r.text, /AWS/);
});

test("fallback answers for unknown unit ids or structural tampering are ignored", async () => {
  const { provider } = chain([[G, [res(500, {})]], [Q, [Q.ok({ rewrites: [{ unitId: "exp99.b1", proposed: "Built React apps." }, { unitId: "edu1.l1", proposed: "PhD, MIT" }] })]]]);
  const r = await pipeline(provider);
  assert.equal(r.t.changes.filter((c) => c.source === "ai").length, 0);
  assert.equal(r.verdict.ok, true);
});

test("the strict deterministic validator is what judges every provider, including composites", () => {
  const { provider } = chain([[G, [G.ok()]], [Q, [Q.ok()]]]);
  const bad = provider.validateTailoring({ proposed: "Built React applications with AWS.", original: "Built React applications.", support: "Built React applications.", forbiddenTerms: ["AWS"] });
  assert.equal(bad.ok, false);
  assert.ok(bad.violations.some((v) => v.code === "missing_requirement"));
});

test("end to end through the API: fallback used, honest provenance recorded, authorization unchanged", async (t) => {
  const { provider } = chain([[G, [res(429, {})]], [Q, [(u, init) => Q.ok({ rewrites: JSON.parse(Q.userOf(JSON.parse(init.body))).units.slice(0, 1).map((x) => ({ unitId: x.unitId, proposed: x.text.replace("React", "React.js") })) })]]]);
  const app = await startApp({ provider }); t.after(app.close);
  app.repo._seedProfile(1, { resume_text: fx.RICH_RESUME });
  app.repo._seedProfile(2, { resume_text: fx.RICH_RESUME });
  const job = app.repo._seedTrackedJob(1, { company: "Google", role: "SWE Intern", description: fx.STRUCTURED_JD });
  const A = app.tokenFor(1); const B = app.tokenFor(2);
  const s = (await app.call("POST", "/tailor?wait=true", { token: A, body: { job: { trackedJobId: job.id } } })).data;
  assert.equal(s.status, "succeeded");
  const v = (await app.call("GET", `/tailored/${s.versionId}`, { token: A })).data;
  assert.equal(v.aiProvider, "groq", "the version records the provider that actually served it");
  assert.equal(v.aiModel, Q.model);
  assert.equal(v.aiUsed, true);
  assert.equal((await app.call("GET", `/tailored/${s.versionId}`, { token: B })).status, 404);
  assert.equal((await app.call("POST", `/versions/${s.versionId}/approve`, { token: B, body: { action: "accept_all" } })).status, 404);
});

test("provider outage (all providers down) still yields a safe deterministic version with an honest warning", async (t) => {
  const { provider } = chain([[G, [res(500, {})]], [Q, [res(500, {})]]]);
  const app = await startApp({ provider }); t.after(app.close);
  app.repo._seedProfile(1, { resume_text: fx.RICH_RESUME });
  const job = app.repo._seedTrackedJob(1, { company: "G", role: "SWE", description: fx.STRUCTURED_JD });
  const s = (await app.call("POST", "/tailor?wait=true", { token: app.tokenFor(1), body: { job: { trackedJobId: job.id } } })).data;
  assert.equal(s.status, "succeeded");
  assert.ok(s.warnings.some((w) => /unavailable/i.test(w)));
  const v = (await app.call("GET", `/tailored/${s.versionId}`, { token: app.tokenFor(1) })).data;
  assert.equal(v.aiUsed, false);
  assert.ok(v.changes.every((c) => c.source === "deterministic"));
});
