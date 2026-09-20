// Small in-process sliding-window rate limiter, keyed per authenticated user
// (falls back to IP). Cheap protection for the endpoints that cost money
// (LLM) or CPU (file parsing). NOTE: counters live in this process only; if
// you run several API instances behind a load balancer, each enforces its own
// window (swap in a Redis-backed store to make it global).
function createRateLimiter({ name, windowMs, max, now = () => Date.now() }) {
  const hits = new Map(); // key -> number[] (timestamps)
  let lastSweep = now();

  return function rateLimit(req, res, next) {
    const t = now();
    if (t - lastSweep > windowMs) {
      for (const [k, arr] of hits) {
        const kept = arr.filter((x) => t - x < windowMs);
        if (kept.length) hits.set(k, kept); else hits.delete(k);
      }
      lastSweep = t;
    }
    const key = req.user?.id ? `u:${req.user.id}` : `ip:${req.ip}`;
    const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
    if (arr.length >= max) {
      const retry = Math.max(1, Math.ceil((windowMs - (t - arr[0])) / 1000));
      res.set("Retry-After", String(retry));
      return res.status(429).json({ message: "Too many requests. Please wait a moment and try again.", code: "rate_limited", retryAfterSeconds: retry, limiter: name });
    }
    arr.push(t);
    hits.set(key, arr);
    return next();
  };
}

module.exports = { createRateLimiter };
