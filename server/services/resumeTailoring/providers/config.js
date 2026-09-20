// Central provider registry. This is the ONE place that knows provider
// endpoints. It deliberately contains NO default model names: models are
// retired and free tiers change, so AI_MODEL must always be set explicitly
// and can be changed without touching code.
//
// Adding another OpenAI-compatible vendor = one entry here + (if it needs
// special headers) a small adapter subclass.

const PROVIDERS = {
  anthropic: { label: "Anthropic", adapter: "anthropic", defaultBaseUrl: "https://api.anthropic.com" },
  openai: { label: "OpenAI", adapter: "openai", defaultBaseUrl: "https://api.openai.com/v1" },
  "openai-compatible": { label: "OpenAI-compatible", adapter: "openai", defaultBaseUrl: "https://api.openai.com/v1" },
  gemini: { label: "Google Gemini", adapter: "gemini", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta", maxOutputTokens: 4096 },
  groq: { label: "Groq", adapter: "groq", defaultBaseUrl: "https://api.groq.com/openai/v1", maxOutputTokens: 2048 },
  openrouter: { label: "OpenRouter", adapter: "openrouter", defaultBaseUrl: "https://openrouter.ai/api/v1", maxOutputTokens: 2048 },
};

const SUPPORTED = ["none", ...Object.keys(PROVIDERS)];

module.exports = { PROVIDERS, SUPPORTED };
