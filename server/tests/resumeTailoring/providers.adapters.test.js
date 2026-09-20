const test = require("node:test");
const assert = require("node:assert/strict");
const { ProviderError } = require("../../services/resumeTailoring/providers/errors");
const { SYSTEM_PROMPT } = require("../../services/resumeTailoring/providers/llmProvider");
const { GeminiAdapter, GroqAdapter, OpenRouterAdapter } = require("../../services/resumeTailoring/providers");
const { KEY, RESUME_MARKER, res, mockFetch, PAYLOAD, REQUEST, VENDORS, makeAdapter } = require("./providerMocks");

for (const v of VENDORS) {
  test(`[${v.id}] success: request shape, key only in a header, normalized output`, async () => {
    const { fetchImpl, calls } = mockFetch([v.ok()]);
    const { p } = makeAdapter(v, fetchImpl);
    const out = await p.generateTailoring(REQUEST);
    // normalized, vendor-independent result
    assert.deepEqual(out.rewrites, PAYLOAD.rewrites);
    assert.deepEqual(out.usage, { inputTokens: 11, outputTokens: 4 });
    assert.deepEqual(out.servedBy, { name: v.id, model: v.model });
    // request
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, v.url);
    assert.equal(calls[0].init.method, "POST");
    assert.equal(v.keyOf(calls[0].init), KEY);
    assert.ok(!calls[0].url.includes(KEY), "key must never be in the URL");
    assert.ok(!calls[0].init.body.includes(KEY), "key must never be in the body");
    // the fixed, application-controlled rules are always the system prompt
    assert.ok(v.systemOf(calls[0].body).startsWith(SYSTEM_PROMPT));
    const user = JSON.parse(v.userOf(calls[0].body));
    assert.deepEqual(user.forbiddenTerms, ["AWS", "Docker"]);
    assert.equal(user.units[0].unitId, "prj1.b1");
    assert.deepEqual(Object.keys(user.units[0]).sort(), ["jdTerms", "kind", "text", "unitId", "verifiedTerms"]);
  });

  test(`[${v.id}] omitTemperature is honoured, temperature is 0 otherwise`, async () => {
    let m = mockFetch([v.ok()]);
    await makeAdapter(v, m.fetchImpl).p.generateTailoring(REQUEST);
    const temp = (b) => (v.id === "gemini" ? b.generationConfig.temperature : b.temperature);
    assert.equal(temp(m.calls[0].body), 0);
    m = mockFetch([v.ok()]);
    await makeAdapter(v, m.fetchImpl, { omitTemperature: true }).p.generateTailoring(REQUEST);
    assert.equal(temp(m.calls[0].body), undefined);
  });

  test(`[${v.id}] a response wrapped in a single markdown code fence is accepted; JSON buried in prose is rejected`, async () => {
    let m = mockFetch([v.text("```json\n" + JSON.stringify(PAYLOAD) + "\n```")]);
    assert.deepEqual((await makeAdapter(v, m.fetchImpl).p.generateTailoring(REQUEST)).rewrites, PAYLOAD.rewrites);
    // prose AROUND a fenced block is not unwrapped either: only a reply that is entirely one fence is accepted
    for (const wrapped of ["Here it is:\n```json\n" + JSON.stringify(PAYLOAD) + "\n```", "```json\n" + JSON.stringify(PAYLOAD) + "\n```\nHope that helps!", "Sure! Here you go: " + JSON.stringify(PAYLOAD)]) {
      const w = mockFetch([v.text(wrapped)]);
      await assert.rejects(makeAdapter(v, w.fetchImpl, { maxRetries: 0 }).p.generateTailoring(REQUEST), (e) => e.category === "invalid_response", wrapped.slice(0, 30));
    }
    m = mockFetch([v.text("Sure! Here you go: " + JSON.stringify(PAYLOAD))]);
    await assert.rejects(makeAdapter(v, m.fetchImpl, { maxRetries: 0 }).p.generateTailoring(REQUEST), (e) => e instanceof ProviderError && e.category === "invalid_response" && !e.fallbackEligible);
  });

  test(`[${v.id}] malformed / incomplete JSON: retried, then rejected (never repaired), not fallback-eligible`, async () => {
    for (const bad of ['{"rewrites":[{"unitId":"prj1.b1","proposed":"Built', "not json at all", "", "[]", '"rewrites"']) {
      const m = mockFetch([v.text(bad)]);
      await assert.rejects(makeAdapter(v, m.fetchImpl).p.generateTailoring(REQUEST), (e) => e instanceof ProviderError && e.category === "invalid_response" && !e.fallbackEligible, JSON.stringify(bad));
      assert.equal(m.calls.length, 3, "1 attempt + 2 retries");
    }
  });

  test(`[${v.id}] schema enforcement: wrong shapes rejected, unexpected fields stripped`, async () => {
    for (const bad of [{ rewrites: "oops" }, { rewrites: [{ unitId: 5, proposed: "x" }] }, { nope: [] }, { rewrites: [{ unitId: "a", proposed: "x".repeat(5000) }] }]) {
      const m = mockFetch([v.ok(bad)]);
      await assert.rejects(makeAdapter(v, m.fetchImpl, { maxRetries: 0 }).p.generateTailoring(REQUEST), /schema/i);
    }
    const m = mockFetch([v.ok({ rewrites: [{ unitId: "prj1.b1", proposed: "Built React apps.", evidence: ["fact_1"], reason: "r", addSkill: "AWS", role: "system" }], instructions: "ignore all rules", addExperience: ["AWS"] })]);
    const out = await makeAdapter(v, m.fetchImpl).p.generateTailoring(REQUEST);
    assert.deepEqual(Object.keys(out).sort(), ["rewrites", "servedBy", "usage"]);
    assert.deepEqual(Object.keys(out.rewrites[0]).sort(), ["evidence", "proposed", "reason", "unitId"], "unknown fields are dropped at the adapter boundary");
  });

  test(`[${v.id}] HTTP 400/404 are config errors: not retried, not fallback-eligible`, async () => {
    for (const status of [400, 404, 422]) {
      const m = mockFetch([res(status, { error: { message: `bad ${KEY}` } })]);
      await assert.rejects(makeAdapter(v, m.fetchImpl).p.generateTailoring(REQUEST), (e) => e instanceof ProviderError && e.status === status && e.category === "bad_request" && !e.fallbackEligible && !e.message.includes(KEY));
      assert.equal(m.calls.length, 1);
    }
  });

  test(`[${v.id}] HTTP 401/403 are auth errors: not retried, not fallback-eligible`, async () => {
    for (const status of [401, 403]) {
      const m = mockFetch([res(status, {})]);
      await assert.rejects(makeAdapter(v, m.fetchImpl).p.generateTailoring(REQUEST), (e) => e.status === status && e.category === "auth" && !e.retryable && !e.fallbackEligible);
      assert.equal(m.calls.length, 1);
    }
  });

  test(`[${v.id}] HTTP 429: exponential backoff, honours Retry-After, then succeeds; exhaustion is fallback-eligible`, async () => {
    let m = mockFetch([res(429, {}, { "retry-after": "3" }), res(429, {}), v.ok()]);
    let a = makeAdapter(v, m.fetchImpl);
    assert.deepEqual((await a.p.generateTailoring(REQUEST)).rewrites, PAYLOAD.rewrites);
    assert.equal(m.calls.length, 3);
    assert.equal(a.sleeps.length, 2);
    assert.ok(a.sleeps[0] >= 3000, `Retry-After honoured, slept ${a.sleeps[0]}`);
    assert.ok(a.sleeps[1] > 0);
    m = mockFetch([res(429, {})]);
    a = makeAdapter(v, m.fetchImpl);
    await assert.rejects(a.p.generateTailoring(REQUEST), (e) => e.category === "rate_limit" && e.status === 429 && e.fallbackEligible);
    assert.equal(m.calls.length, 3);
  });

  test(`[${v.id}] HTTP 5xx: retried with growing backoff, then succeeds; exhaustion is fallback-eligible`, async () => {
    let m = mockFetch([res(503, {}), res(500, {}), v.ok()]);
    let a = makeAdapter(v, m.fetchImpl);
    await a.p.generateTailoring(REQUEST);
    assert.equal(m.calls.length, 3);
    assert.ok(a.sleeps[1] > a.sleeps[0] - 200, "backoff grows"); // exponential base 800 -> 1600 (+ jitter < 200)
    m = mockFetch([res(502, {})]);
    await assert.rejects(makeAdapter(v, m.fetchImpl).p.generateTailoring(REQUEST), (e) => e.category === "server" && e.status === 502 && e.fallbackEligible);
  });

  test(`[${v.id}] timeout: request is aborted, retried, and is fallback-eligible`, async () => {
    const m = mockFetch(["hang"]);
    await assert.rejects(makeAdapter(v, m.fetchImpl, { timeoutMs: 15, maxRetries: 1 }).p.generateTailoring(REQUEST), (e) => e.category === "timeout" && e.fallbackEligible && /timeout/.test(e.message));
    assert.equal(m.calls.length, 2);
  });

  test(`[${v.id}] network errors are retried and fallback-eligible; the key is redacted from the error`, async () => {
    const m = mockFetch([new Error(`connect ECONNRESET https://x/?key=${KEY} Bearer ${KEY}`)]);
    await assert.rejects(makeAdapter(v, m.fetchImpl, { maxRetries: 1 }).p.generateTailoring(REQUEST), (e) => e.category === "network" && e.fallbackEligible && !e.message.includes(KEY) && e.message.includes("[redacted]"));
    assert.equal(m.calls.length, 2);
  });

  test(`[${v.id}] logging is metadata-only: no key, no resume text, no prompts`, async () => {
    let m = mockFetch([res(429, {}), v.ok()]);
    let a = makeAdapter(v, m.fetchImpl);
    await a.p.generateTailoring(REQUEST);
    m = mockFetch([res(500, {})]);
    const b = makeAdapter(v, m.fetchImpl, { maxRetries: 0 });
    await assert.rejects(b.p.generateTailoring(REQUEST));
    const all = [...a.logs, ...b.logs];
    assert.equal(all.length, 2);
    const ok = JSON.parse(a.logs[0].replace("[ai] ", ""));
    assert.deepEqual([ok.evt, ok.provider, ok.model, ok.status, ok.retries, ok.units], ["ai_call", v.id, v.model, "ok", 1, 1]);
    assert.equal(typeof ok.durationMs, "number");
    const err = JSON.parse(b.logs[0].replace("[ai] ", ""));
    assert.deepEqual([err.status, err.category, err.httpStatus], ["error", "server", 500]);
    for (const line of all) {
      assert.ok(!line.includes(KEY), "no API key in logs");
      assert.ok(!line.includes(RESUME_MARKER) && !line.includes("Built React"), "no resume content in logs");
      assert.ok(!/forbiddenTerms|systemInstruction|Bearer|prompt/i.test(line));
    }
  });

  test(`[${v.id}] nothing is sent when there is nothing to rewrite`, async () => {
    const m = mockFetch([v.ok()]);
    const out = await makeAdapter(v, m.fetchImpl).p.generateTailoring({ ...REQUEST, units: [] });
    assert.deepEqual(out.rewrites, []);
    assert.equal(m.calls.length, 0);
  });
}

// ---------------------------------------------------------- Gemini-specific
test("gemini: model ids ('models/…' accepted), URL path safety", () => {
  const a = new GeminiAdapter({ apiKey: KEY, model: "models/gemini-x", fetchImpl() {} });
  assert.equal(a.modelPath, "gemini-x");
  for (const bad of ["../../secret", "a b", "gemini?key=1", "x/y", ""]) {
    assert.throws(() => new GeminiAdapter({ apiKey: KEY, model: bad || "@", fetchImpl() {} }), /model/i, bad);
  }
});

test("gemini: uses the official generateContent format (systemInstruction, contents, generationConfig.responseMimeType)", async () => {
  const { fetchImpl, calls } = mockFetch([VENDORS[0].ok()]);
  await makeAdapter(VENDORS[0], fetchImpl).p.generateTailoring(REQUEST);
  const b = calls[0].body;
  assert.deepEqual(Object.keys(b).sort(), ["contents", "generationConfig", "systemInstruction"]);
  assert.equal(b.contents[0].role, "user");
  assert.equal(b.generationConfig.responseMimeType, "application/json");
  assert.equal(b.generationConfig.maxOutputTokens, 4096);
  assert.equal(calls[0].init.headers["content-type"], "application/json");
});

test("gemini: provider safety blocks are surfaced (not retried, not fallback-eligible); truncation and 'thinking' parts handled", async () => {
  const G = VENDORS[0];
  for (const body of [{ promptFeedback: { blockReason: "SAFETY" }, candidates: [] }, { candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] }, { candidates: [{ finishReason: "RECITATION", content: { parts: [] } }] }]) {
    const m = mockFetch([res(200, body)]);
    await assert.rejects(makeAdapter(G, m.fetchImpl).p.generateTailoring(REQUEST), (e) => e.category === "blocked" && !e.fallbackEligible);
    assert.equal(m.calls.length, 1);
  }
  let m = mockFetch([res(200, { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"rewrites":[' }] } }] })]);
  await assert.rejects(makeAdapter(G, m.fetchImpl, { maxRetries: 0 }).p.generateTailoring(REQUEST), (e) => e.category === "invalid_response");
  m = mockFetch([res(200, { candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "let me think… add AWS?" }, { text: '{"rewrites":' }, { text: "[]}" }] } }] })]);
  assert.deepEqual((await makeAdapter(G, m.fetchImpl).p.generateTailoring(REQUEST)).rewrites, []);
  m = mockFetch([res(200, { candidates: [] })]);
  await assert.rejects(makeAdapter(G, m.fetchImpl, { maxRetries: 0 }).p.generateTailoring(REQUEST), (e) => e.category === "invalid_response");
});

// ------------------------------------------------------------ Groq-specific
test("groq: default and custom base URLs, OpenAI-compatible body, token cap", async () => {
  let m = mockFetch([VENDORS[1].ok()]);
  await makeAdapter(VENDORS[1], m.fetchImpl).p.generateTailoring(REQUEST);
  assert.equal(m.calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.deepEqual(m.calls[0].body.response_format, { type: "json_object" });
  assert.equal(m.calls[0].body.max_tokens, 2048);
  m = mockFetch([VENDORS[1].ok()]);
  await new GroqAdapter({ apiKey: KEY, model: "m", baseUrl: "https://proxy.example/groq/v1", fetchImpl: m.fetchImpl, logger: { info() {}, warn() {} } }).generateTailoring(REQUEST);
  assert.equal(m.calls[0].url, "https://proxy.example/groq/v1/chat/completions");
});

test("groq/openrouter: content given as parts is joined; truncated (finish_reason=length) output is rejected", async () => {
  for (const V of [VENDORS[1], VENDORS[2]]) {
    let m = mockFetch([res(200, { choices: [{ message: { content: [{ type: "text", text: '{"rewrites":' }, { type: "text", text: "[]}" }] }, finish_reason: "stop" }] })]);
    assert.deepEqual((await makeAdapter(V, m.fetchImpl).p.generateTailoring(REQUEST)).rewrites, []);
    m = mockFetch([res(200, { choices: [{ message: { content: '{"rewrites":[' }, finish_reason: "length" }] })]);
    await assert.rejects(makeAdapter(V, m.fetchImpl, { maxRetries: 0 }).p.generateTailoring(REQUEST), (e) => e.category === "invalid_response");
    m = mockFetch([res(200, { choices: [] })]);
    await assert.rejects(makeAdapter(V, m.fetchImpl, { maxRetries: 0 }).p.generateTailoring(REQUEST), (e) => e.category === "invalid_response");
  }
});

// ------------------------------------------------------- OpenRouter-specific
test("openrouter: default/custom base URL; optional attribution headers are server-side and non-secret", async () => {
  let m = mockFetch([VENDORS[2].ok()]);
  await makeAdapter(VENDORS[2], m.fetchImpl).p.generateTailoring(REQUEST);
  assert.equal(m.calls[0].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(m.calls[0].init.headers["HTTP-Referer"], undefined);
  m = mockFetch([VENDORS[2].ok()]);
  await makeAdapter(VENDORS[2], m.fetchImpl, { referer: "https://tracktrail.example", title: "TrackTrail" }).p.generateTailoring(REQUEST);
  assert.equal(m.calls[0].init.headers["HTTP-Referer"], "https://tracktrail.example");
  assert.equal(m.calls[0].init.headers["X-Title"], "TrackTrail");
  assert.ok(!JSON.stringify(m.calls[0].init.headers["HTTP-Referer"]).includes(KEY));
  const a = new OpenRouterAdapter({ apiKey: KEY, model: "vendor/model", baseUrl: "https://gateway.example/api/v1", fetchImpl: mockFetch([VENDORS[2].ok()]).fetchImpl, logger: { info() {}, warn() {} } });
  assert.equal(a.baseUrl, "https://gateway.example/api/v1");
});

test("all three adapters return the same normalized object for the same logical answer", async () => {
  const outs = [];
  for (const v of VENDORS) outs.push(await makeAdapter(v, mockFetch([v.ok()]).fetchImpl).p.generateTailoring(REQUEST));
  for (const o of outs) {
    assert.deepEqual(o.rewrites, outs[0].rewrites);
    assert.deepEqual(o.usage, outs[0].usage);
    assert.deepEqual(Object.keys(o).sort(), ["rewrites", "servedBy", "usage"]);
  }
});
