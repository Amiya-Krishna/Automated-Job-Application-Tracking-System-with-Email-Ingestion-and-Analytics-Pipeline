// Small, dependency-free safety helpers shared by every LLM adapter.
const { ProviderError } = require("./errors");

const MAX_RESPONSE_CHARS = 200_000;

/** Remove secrets from any text that might be logged or surfaced. */
function redactSecrets(text, secrets = []) {
  let out = String(text ?? "");
  for (const s of secrets) {
    if (s && String(s).length >= 6) out = out.split(String(s)).join("[redacted]");
  }
  return out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g, "Bearer [redacted]");
}

/**
 * The ONLY tolerance applied to model output before schema validation: if the
 * entire reply is a single markdown code fence (```json ... ```), unwrap it.
 * No JSON is ever "extracted" from surrounding prose and nothing is repaired;
 * anything else that is not valid JSON is rejected. The result must still pass
 * the zod schema and, later, evidence + structural validation.
 */
function stripCodeFence(text) {
  const m = /^\s*```(?:json|JSON)?[ \t]*\r?\n?([\s\S]*?)\r?\n?```\s*$/.exec(text);
  return m ? m[1] : text;
}

function parseModelJson(text) {
  if (typeof text !== "string" || !text.trim()) throw new ProviderError("Model returned no content.", { retryable: true, category: "invalid_response" });
  if (text.length > MAX_RESPONSE_CHARS) throw new ProviderError("Model response was unexpectedly large.", { retryable: false, category: "invalid_response" });
  let value;
  try {
    value = JSON.parse(stripCodeFence(text));
  } catch {
    throw new ProviderError("Model returned invalid JSON.", { retryable: true, category: "invalid_response" });
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderError("Model returned JSON in an unexpected shape.", { retryable: true, category: "invalid_response" });
  }
  return value;
}

/**
 * API keys are only ever sent over TLS (plain http is allowed solely for
 * loopback, e.g. a local model server). Anything else is refused BEFORE a key
 * could be sent to it.
 */
function assertSafeBaseUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { throw new Error("is not a valid URL"); }
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && loopback)) throw new Error("must use https (http is only allowed for localhost)");
  if (u.username || u.password) throw new Error("must not contain credentials");
  return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
}

/** One usage shape for every provider. */
function normalizeUsage({ input, output }) {
  const i = Number.isFinite(input) ? input : null;
  const o = Number.isFinite(output) ? output : null;
  return i === null && o === null ? null : { inputTokens: i, outputTokens: o };
}

/**
 * Content-free structured logger. It is only ever handed metadata (provider,
 * model, timings, status, counts) — never resume/JD text, prompts, responses,
 * tokens or keys. AI_LOG_LEVEL=silent disables it.
 */
function defaultLogger(env = process.env) {
  if (String(env.AI_LOG_LEVEL || "").toLowerCase() === "silent") return { info() {}, warn() {} };
  return {
    info: (line) => console.info(line),
    warn: (line) => console.warn(line),
  };
}

const LOG_FIELDS = new Set(["evt", "provider", "model", "status", "httpStatus", "category", "durationMs", "retries", "units", "usage", "from", "to", "reason", "fallbackUsed"]);
function logLine(fields) {
  const safe = {};
  for (const [k, v] of Object.entries(fields)) if (LOG_FIELDS.has(k)) safe[k] = v; // allow-list: unknown fields can't leak
  return `[ai] ${JSON.stringify(safe)}`;
}

module.exports = { redactSecrets, stripCodeFence, parseModelJson, assertSafeBaseUrl, normalizeUsage, defaultLogger, logLine, MAX_RESPONSE_CHARS };
