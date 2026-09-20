// Optional provider fallback chain.
//
// FallbackProvider tries providers in order. It moves to the next one ONLY for
// transient provider-side failures (ProviderError.fallbackEligible: timeout,
// network, rate_limit, 5xx) after the current provider has exhausted its own
// retries. It never falls back for auth/config errors, bad requests, malformed
// or schema-invalid output, or provider safety blocks — those are surfaced,
// not masked by trying another vendor.
//
// Fallback is purely a transport concern: whichever provider answers, the
// result flows through the SAME code path as any other provider response —
// schema validation (inside each adapter), then the engine's evidence
// validator, then structural verification. A fallback response gets no
// special trust.

const { AIProvider } = require("./base");
const { ProviderError } = require("./errors");
const { defaultLogger, logLine } = require("./safety");

class FallbackProvider extends AIProvider {
  constructor(chain, { logger } = {}) {
    super();
    if (!Array.isArray(chain) || chain.length < 2) throw new Error("FallbackProvider needs at least two providers");
    this.chain = chain;
    this.logger = logger || defaultLogger();
  }
  get name() { return this.chain[0].name; }
  get model() { return this.chain[0].model; }
  get usesLLM() { return true; }

  async generateTailoring(request) {
    const attempts = [];
    let lastErr;
    for (let i = 0; i < this.chain.length; i += 1) {
      const p = this.chain[i];
      try {
        const out = await p.generateTailoring(request);
        return { ...out, servedBy: out.servedBy || { name: p.name, model: p.model }, fallbackUsed: i > 0, attempts };
      } catch (err) {
        lastErr = err;
        const known = err instanceof ProviderError;
        attempts.push({ provider: p.name, model: p.model, category: known ? err.category : "unknown", status: known ? err.status : null });
        if (!(known && err.fallbackEligible) || i === this.chain.length - 1) break;
        this.logger.warn(logLine({ evt: "ai_fallback", from: p.name, to: this.chain[i + 1].name, reason: err.category }));
      }
    }
    if (lastErr && typeof lastErr === "object") lastErr.attempts = attempts;
    throw lastErr;
  }
}

module.exports = { FallbackProvider };
