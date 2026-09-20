// Vendor adapters. Each is a thin subclass of LlmProvider that only knows how
// to build its vendor's HTTP request and read its vendor's HTTP response. They
// all hand back the SAME normalized object:
//     { rewrites: [{unitId, proposed, ...}], usage: {inputTokens, outputTokens}|null, servedBy }
// Retry / timeout / schema validation / error categories / redaction / logging
// are inherited, not re-implemented. Nothing here parses resumes or JDs, matches
// skills, or validates evidence — that all stays deterministic and outside the
// provider.

const { LlmProvider, SYSTEM_PROMPT, JSON_SHAPE_HINT } = require("./llmProvider");
const { ProviderError } = require("./errors");
const { PROVIDERS } = require("./config");
const { parseModelJson, normalizeUsage } = require("./safety");

// ------------------------------------------------------------------ Gemini
// Google Gemini API (generateContent). Docs: https://ai.google.dev/api/generate-content
class GeminiAdapter extends LlmProvider {
  constructor(opts) {
    super({ ...opts, kind: "gemini", name: "gemini", lenientJson: true, baseUrl: opts.baseUrl || PROVIDERS.gemini.defaultBaseUrl, maxOutputTokens: opts.maxOutputTokens || PROVIDERS.gemini.maxOutputTokens });
    // The model id becomes part of the URL path: accept "gemini-x" or "models/gemini-x", nothing else.
    const id = String(opts.model).replace(/^models\//, "");
    if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error("AI_MODEL contains characters that are not valid in a Gemini model id");
    this.modelPath = id;
  }

  _buildRequest(user) {
    return {
      // The key travels in a header, NEVER in the URL, so it can't leak via URL logging.
      url: `${this.baseUrl}/models/${this.modelPath}:generateContent`,
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey, ...this.extraHeaders },
      body: {
        systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT}\n${JSON_SHAPE_HINT}` }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: this.maxOutputTokens,
          ...(this.omitTemperature ? {} : { temperature: 0 }),
        },
      },
    };
  }

  _readResponse(data) {
    if (data.promptFeedback && data.promptFeedback.blockReason) {
      throw new ProviderError("The AI provider declined to process this request.", { retryable: false, category: "blocked" });
    }
    const cand = data.candidates && data.candidates[0];
    if (!cand) throw new ProviderError("Model returned no candidates.", { retryable: true, category: "invalid_response" });
    const reason = cand.finishReason;
    if (reason && !["STOP", "MAX_TOKENS", "FINISH_REASON_UNSPECIFIED"].includes(reason)) {
      throw new ProviderError("The AI provider declined to produce this output.", { retryable: false, category: "blocked" });
    }
    if (reason === "MAX_TOKENS") throw new ProviderError("Model output was truncated.", { retryable: true, category: "invalid_response" });
    const text = ((cand.content && cand.content.parts) || [])
      .filter((p) => p && typeof p.text === "string" && !p.thought) // ignore "thinking" parts
      .map((p) => p.text)
      .join("");
    const u = data.usageMetadata || {};
    return { json: parseModelJson(text), usage: normalizeUsage({ input: u.promptTokenCount, output: u.candidatesTokenCount }) };
  }
}

// -------------------------------------------- OpenAI-compatible: Groq
// Groq exposes an OpenAI-compatible chat-completions API; the shared request /
// response code in LlmProvider is reused, with lenient (fence-only) JSON parsing.
class GroqAdapter extends LlmProvider {
  constructor(opts) {
    super({ ...opts, kind: "openai", name: "groq", lenientJson: true, baseUrl: opts.baseUrl || PROVIDERS.groq.defaultBaseUrl, maxOutputTokens: opts.maxOutputTokens || PROVIDERS.groq.maxOutputTokens });
  }
}

// ----------------------------------------- OpenAI-compatible: OpenRouter
// OpenRouter is OpenAI-compatible. It optionally accepts attribution headers
// (HTTP-Referer / X-Title). They are NOT secrets and are set server-side only.
class OpenRouterAdapter extends LlmProvider {
  constructor(opts) {
    const { referer, title, ...rest } = opts;
    const extraHeaders = { ...(rest.extraHeaders || {}) };
    if (referer) extraHeaders["HTTP-Referer"] = referer;
    if (title) extraHeaders["X-Title"] = title;
    super({ ...rest, extraHeaders, kind: "openai", name: "openrouter", lenientJson: true, baseUrl: rest.baseUrl || PROVIDERS.openrouter.defaultBaseUrl, maxOutputTokens: rest.maxOutputTokens || PROVIDERS.openrouter.maxOutputTokens });
  }
}

module.exports = { GeminiAdapter, GroqAdapter, OpenRouterAdapter };
