// Provider error taxonomy. Every failure that crosses the adapter boundary is
// a ProviderError with a `category`, so retry and fallback decisions are made
// on WHAT went wrong, never on message text.
//
//   timeout / network / rate_limit / server   transient provider-side problems
//                                             -> retried; fallback-eligible
//   auth                                      401/403: our key/config is wrong
//   bad_request                               400/404/other 4xx: our request/model is wrong
//   invalid_response                          the model answered, but not with usable
//                                             structured output (bad JSON, schema mismatch)
//   blocked                                   the provider declined the content
//   unknown                                   anything else
//
// Only the first group is fallback-eligible. Auth/config/schema/safety
// problems are NOT masked by silently trying another vendor.

const FALLBACK_CATEGORIES = new Set(["timeout", "network", "rate_limit", "server"]);

function categorize(status, retryable) {
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  if (status === 401 || status === 403) return "auth";
  if (status >= 400) return "bad_request";
  return retryable ? "network" : "unknown";
}

class ProviderError extends Error {
  constructor(message, { retryable = false, status = null, category = null, retryAfterMs = null } = {}) {
    super(message);
    this.name = "ProviderError";
    this.retryable = retryable;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.category = category || categorize(status, retryable);
  }
  get fallbackEligible() {
    return FALLBACK_CATEGORIES.has(this.category);
  }
}

module.exports = { ProviderError, FALLBACK_CATEGORIES, categorize };
