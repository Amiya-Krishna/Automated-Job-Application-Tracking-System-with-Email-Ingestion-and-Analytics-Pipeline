// Mock HTTP layer + vendor response builders shared by the provider tests.
process.env.AI_LOG_LEVEL = "silent";
const { GeminiAdapter, GroqAdapter, OpenRouterAdapter } = require("../../services/resumeTailoring/providers");

const KEY = "SENTINEL-KEY-do-not-leak-0123456789";
const RESUME_MARKER = "ZXQ-PRIVATE-RESUME-TEXT-MARKER";

const res = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[String(k).toLowerCase()] ?? null },
  json: async () => body,
});

/** steps: response | Error | "hang" | (url, init) => response. The last step repeats. */
function mockFetch(steps) {
  const calls = [];
  const queue = [...steps];
  const fetchImpl = (url, init) => {
    calls.push({ url, init, body: init && init.body ? JSON.parse(init.body) : null });
    const step = queue.length > 1 ? queue.shift() : queue[0];
    if (step === "hang") return new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    if (step instanceof Error) return Promise.reject(step);
    return Promise.resolve(typeof step === "function" ? step(url, init) : step);
  };
  return { fetchImpl, calls };
}

const PAYLOAD = { rewrites: [{ unitId: "prj1.b1", proposed: "Built React apps." }] };
const REQUEST = {
  units: [{ id: "prj1.b1", kind: "project_bullet", text: `Built React applications. ${RESUME_MARKER}`, verifiedTerms: ["React"], jdTerms: ["React"] }],
  forbiddenTerms: ["AWS", "Docker"],
  conservative: false,
};

// Vendor-specific response shapes (the ONLY place they differ).
const VENDORS = [
  {
    id: "gemini", Adapter: GeminiAdapter, model: "gemini-test-model", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent",
    keyOf: (init) => init.headers["x-goog-api-key"],
    ok: (obj = PAYLOAD, extra = {}) => res(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 4 }, ...extra }),
    text: (text) => res(200, { candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }),
    systemOf: (b) => b.systemInstruction.parts[0].text,
    userOf: (b) => b.contents[0].parts[0].text,
  },
  {
    id: "groq", Adapter: GroqAdapter, model: "groq-test-model", url: "https://api.groq.com/openai/v1/chat/completions",
    keyOf: (init) => init.headers.authorization.replace("Bearer ", ""),
    ok: (obj = PAYLOAD) => res(200, { choices: [{ message: { content: JSON.stringify(obj) }, finish_reason: "stop" }], usage: { prompt_tokens: 11, completion_tokens: 4 } }),
    text: (text) => res(200, { choices: [{ message: { content: text }, finish_reason: "stop" }] }),
    systemOf: (b) => b.messages[0].content,
    userOf: (b) => b.messages[1].content,
  },
  {
    id: "openrouter", Adapter: OpenRouterAdapter, model: "vendor/openrouter-test-model", url: "https://openrouter.ai/api/v1/chat/completions",
    keyOf: (init) => init.headers.authorization.replace("Bearer ", ""),
    ok: (obj = PAYLOAD) => res(200, { choices: [{ message: { content: JSON.stringify(obj) }, finish_reason: "stop" }], usage: { prompt_tokens: 11, completion_tokens: 4 } }),
    text: (text) => res(200, { choices: [{ message: { content: text }, finish_reason: "stop" }] }),
    systemOf: (b) => b.messages[0].content,
    userOf: (b) => b.messages[1].content,
  },
];

function makeAdapter(v, fetchImpl, extra = {}) {
  const logs = [];
  const sleeps = [];
  const logger = { info: (l) => logs.push(l), warn: (l) => logs.push(l) };
  const p = new v.Adapter({ apiKey: KEY, model: v.model, fetchImpl, sleepImpl: async (ms) => { sleeps.push(ms); }, logger, timeoutMs: 2000, maxRetries: 2, ...extra });
  return { p, logs, sleeps };
}

module.exports = { KEY, RESUME_MARKER, res, mockFetch, PAYLOAD, REQUEST, VENDORS, makeAdapter };
