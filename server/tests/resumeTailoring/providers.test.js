const test = require("node:test");
const assert = require("node:assert/strict");
const { createProvider } = require("../../services/resumeTailoring/providers");
const { LlmProvider, ProviderError } = require("../../services/resumeTailoring/providers/llmProvider");
const { AIProvider } = require("../../services/resumeTailoring/providers/base");

const req = { units: [{ id: "prj1.b1", kind: "project_bullet", text: "Built React applications.", verifiedTerms: ["React"], jdTerms: ["React"] }], forbiddenTerms: ["AWS", "Docker"], conservative: false };
const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const mk = (kind, responses, extra = {}) => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); const r = responses.shift(); if (r instanceof Error) throw r; return r; };
  return { p: new LlmProvider({ kind, apiKey: "sk-test", model: "test-model", fetchImpl, sleepImpl: async () => {}, ...extra }), calls };
};

test("factory: env-driven, deterministic by default, never crashes on bad config", () => {
  assert.equal(createProvider({}).usesLLM, false);
  assert.equal(createProvider({ AI_PROVIDER: "none" }).usesLLM, false);
  const missing = createProvider({ AI_PROVIDER: "anthropic" });
  assert.equal(missing.usesLLM, false);
  assert.match(missing.configNote, /AI_API_KEY or AI_MODEL is missing/);
  assert.match(createProvider({ AI_PROVIDER: "wat", AI_API_KEY: "k", AI_MODEL: "m" }).configNote, /Unknown AI_PROVIDER/);
  const a = createProvider({ AI_PROVIDER: "anthropic", AI_API_KEY: "k", AI_MODEL: "m" });
  assert.equal(a.usesLLM, true); assert.equal(a.name, "anthropic"); assert.equal(a.model, "m");
  assert.equal(createProvider({ AI_PROVIDER: "openai-compatible", AI_API_KEY: "k", AI_MODEL: "m", AI_BASE_URL: "http://localhost:11434/v1" }).baseUrl, "http://localhost:11434/v1");
});

test("interface: every AIProvider method exists and works deterministically", async () => {
  const p = new AIProvider();
  for (const m of ["analyzeResume", "analyzeJobDescription", "matchResumeToJob", "generateTailoring", "validateTailoring"]) assert.equal(typeof p[m], "function", m);
  assert.deepEqual((await p.generateTailoring(req)).rewrites, []);
});

test("anthropic: request shape (forced tool use, key in header only), structured response parsed", async () => {
  const { p, calls } = mk("anthropic", [jsonRes(200, { content: [{ type: "tool_use", name: "submit_rewrites", input: { rewrites: [{ unitId: "prj1.b1", proposed: "Built React apps." }] } }], usage: { input_tokens: 5 } })]);
  const out = await p.generateTailoring(req);
  assert.deepEqual(out.rewrites, [{ unitId: "prj1.b1", proposed: "Built React apps." }]);
  const c = calls[0];
  assert.equal(c.url, "https://api.anthropic.com/v1/messages");
  assert.equal(c.init.headers["x-api-key"], "sk-test");
  assert.deepEqual(c.body.tool_choice, { type: "tool", name: "submit_rewrites" });
  assert.equal(c.body.temperature, 0);
  assert.ok(!JSON.stringify(c.body).includes("sk-test"), "key must not be in the body");
  const payload = JSON.parse(c.body.messages[0].content);
  assert.deepEqual(payload.forbiddenTerms, ["AWS", "Docker"]);
  assert.match(c.body.system, /DATA taken from a person's résumé/);
});

test("openai-compatible: request shape and JSON parsing", async () => {
  const { p, calls } = mk("openai", [jsonRes(200, { choices: [{ message: { content: JSON.stringify({ rewrites: [] }) } }] })], { baseUrl: "https://llm.example/v1/" });
  assert.deepEqual((await p.generateTailoring(req)).rewrites, []);
  assert.equal(calls[0].url, "https://llm.example/v1/chat/completions");
  assert.equal(calls[0].init.headers.authorization, "Bearer sk-test");
  assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
});

test("retries transient failures (429/5xx/network) then succeeds; fails fast on 4xx", async () => {
  const ok = jsonRes(200, { content: [{ type: "tool_use", input: { rewrites: [] } }] });
  const a = mk("anthropic", [jsonRes(429, {}), jsonRes(503, {}), ok]);
  assert.deepEqual((await a.p.generateTailoring(req)).rewrites, []);
  assert.equal(a.calls.length, 3);
  const b = mk("anthropic", [new Error("ECONNRESET"), ok]);
  await b.p.generateTailoring(req);
  assert.equal(b.calls.length, 2);
  const c = mk("anthropic", [jsonRes(401, {}), ok]);
  await assert.rejects(c.p.generateTailoring(req), (e) => e instanceof ProviderError && e.status === 401);
  assert.equal(c.calls.length, 1);
  const d = mk("anthropic", [jsonRes(500, {}), jsonRes(500, {}), jsonRes(500, {}), ok], { maxRetries: 2 });
  await assert.rejects(d.p.generateTailoring(req));
  assert.equal(d.calls.length, 3);
});

test("schema enforcement: prose / malformed / wrong-shape output is never accepted", async () => {
  for (const bad of [
    { content: [{ type: "text", text: "Sure! Here is your resume with AWS added." }] },
    { content: [{ type: "tool_use", input: { rewrites: "oops" } }] },
    { content: [{ type: "tool_use", input: { rewrites: [{ unitId: 5, proposed: "x" }] } }] },
    { content: [{ type: "tool_use", input: { rewrites: [{ unitId: "a", proposed: "x".repeat(5000) }] } }] },
  ]) {
    const { p } = mk("anthropic", [jsonRes(200, bad), jsonRes(200, bad), jsonRes(200, bad)]);
    await assert.rejects(p.generateTailoring(req), /schema|structured/i);
  }
  const { p } = mk("openai", [jsonRes(200, { choices: [{ message: { content: "not json" } }] }), jsonRes(200, { choices: [{ message: { content: "not json" } }] }), jsonRes(200, { choices: [{ message: { content: "not json" } }] })]);
  await assert.rejects(p.generateTailoring(req), /invalid JSON/);
});

test("times out hung requests", async () => {
  const fetchImpl = (url, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  const p = new LlmProvider({ kind: "anthropic", apiKey: "k", model: "m", timeoutMs: 20, maxRetries: 0, fetchImpl, sleepImpl: async () => {} });
  await assert.rejects(p.generateTailoring(req), /timeout/);
});

test("nothing is sent to the model when there is nothing to rewrite", async () => {
  const { p, calls } = mk("anthropic", []);
  assert.deepEqual((await p.generateTailoring({ ...req, units: [] })).rewrites, []);
  assert.equal(calls.length, 0);
});
