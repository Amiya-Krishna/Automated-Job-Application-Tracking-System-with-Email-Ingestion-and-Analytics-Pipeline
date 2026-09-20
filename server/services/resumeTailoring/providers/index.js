// Provider factory, configured entirely from environment variables.
//
//   AI_PROVIDER      none | gemini | groq | openrouter | anthropic | openai | openai-compatible   (default: none)
//   AI_API_KEY       secret, server-side only
//   AI_MODEL         model id exactly as listed in the provider's docs (NO default: models change)
//   AI_BASE_URL      optional; defaults come from providers/config.js
//
//   AI_FALLBACK_PROVIDER / AI_FALLBACK_API_KEY / AI_FALLBACK_MODEL / AI_FALLBACK_BASE_URL   (all optional)
//        Used only for transient provider failures; see fallback.js.
//
//   AI_TIMEOUT_MS, AI_MAX_RETRIES, AI_OMIT_TEMPERATURE, AI_MAX_OUTPUT_TOKENS, AI_LOG_LEVEL   (optional)
//   AI_OPENROUTER_REFERER, AI_OPENROUTER_TITLE   (optional, non-secret OpenRouter attribution headers)
//
// A missing/invalid configuration NEVER crashes the app: it degrades to the
// deterministic provider (reorder-only tailoring) with a `configNote` explaining why.
const { AIProvider } = require("./base");
const { LlmProvider } = require("./llmProvider");
const { GeminiAdapter, GroqAdapter, OpenRouterAdapter } = require("./adapters");
const { FallbackProvider } = require("./fallback");
const { PROVIDERS, SUPPORTED } = require("./config");
const { assertSafeBaseUrl, defaultLogger } = require("./safety");

const deterministic = (configNote = null) => Object.assign(new AIProvider(), { configNote });

/** Build ONE provider from a {id, apiKey, model, baseUrl} spec. Returns {provider} or {note}. */
function buildOne(spec, common, label, vars) {
  const id = String(spec.id || "").trim().toLowerCase();
  const def = PROVIDERS[id];
  if (!def) return { note: `Unknown ${label} "${spec.id}". Supported: ${SUPPORTED.join(", ")}.` };
  if (!spec.apiKey || !spec.model) return { note: `${label} is set but ${vars.key} or ${vars.model} is missing.` };

  let baseUrl;
  if (spec.baseUrl) {
    try { baseUrl = assertSafeBaseUrl(spec.baseUrl); } catch (e) { return { note: `Base URL for ${label} ${e.message}.` }; }
  }
  const opts = { apiKey: spec.apiKey, model: spec.model, baseUrl, ...common };
  try {
    switch (def.adapter) {
      case "gemini": return { provider: new GeminiAdapter(opts) };
      case "groq": return { provider: new GroqAdapter(opts) };
      case "openrouter": return { provider: new OpenRouterAdapter({ ...opts, referer: common.openRouterReferer, title: common.openRouterTitle }) };
      case "anthropic": return { provider: new LlmProvider({ ...opts, kind: "anthropic" }) };
      default: return { provider: new LlmProvider({ ...opts, kind: "openai", name: id === "openai-compatible" ? "openai-compatible" : "openai" }) };
    }
  } catch (e) {
    return { note: `Could not configure ${label} "${id}": ${e.message}.` };
  }
}

function createProvider(env = process.env, overrides = {}) {
  const primaryId = String(env.AI_PROVIDER || "none").trim().toLowerCase();
  if (primaryId === "none" || primaryId === "") return deterministic(null);

  const maxRetries = env.AI_MAX_RETRIES === undefined || env.AI_MAX_RETRIES === "" ? 2 : Number(env.AI_MAX_RETRIES);
  const common = {
    timeoutMs: Number(env.AI_TIMEOUT_MS) || 45_000,
    maxRetries: Number.isFinite(maxRetries) && maxRetries >= 0 ? maxRetries : 2,
    omitTemperature: String(env.AI_OMIT_TEMPERATURE).toLowerCase() === "true",
    maxOutputTokens: Number(env.AI_MAX_OUTPUT_TOKENS) > 0 ? Number(env.AI_MAX_OUTPUT_TOKENS) : undefined,
    openRouterReferer: env.AI_OPENROUTER_REFERER || undefined,
    openRouterTitle: env.AI_OPENROUTER_TITLE || undefined,
    logger: overrides.logger || defaultLogger(env),
    ...overrides,
  };

  const primary = buildOne({ id: primaryId, apiKey: env.AI_API_KEY, model: env.AI_MODEL, baseUrl: env.AI_BASE_URL }, common, "AI_PROVIDER", { key: "AI_API_KEY", model: "AI_MODEL" });
  if (!primary.provider) return deterministic(`${primary.note} Using deterministic mode.`);

  const fbId = String(env.AI_FALLBACK_PROVIDER || "").trim().toLowerCase();
  if (!fbId || fbId === "none") return primary.provider;

  // A fallback on the SAME vendor (e.g. a cheaper model) may reuse the primary key; a different vendor never does.
  const fbKey = env.AI_FALLBACK_API_KEY || (fbId === primaryId ? env.AI_API_KEY : "");
  const fb = buildOne({ id: fbId, apiKey: fbKey, model: env.AI_FALLBACK_MODEL, baseUrl: env.AI_FALLBACK_BASE_URL }, common, "AI_FALLBACK_PROVIDER", { key: "AI_FALLBACK_API_KEY", model: "AI_FALLBACK_MODEL" });
  if (!fb.provider) return Object.assign(primary.provider, { configNote: `${fb.note} Continuing without a fallback provider.` });

  return Object.assign(new FallbackProvider([primary.provider, fb.provider], { logger: common.logger }), { configNote: null });
}

module.exports = { createProvider, AIProvider, LlmProvider, GeminiAdapter, GroqAdapter, OpenRouterAdapter, FallbackProvider, SUPPORTED };
