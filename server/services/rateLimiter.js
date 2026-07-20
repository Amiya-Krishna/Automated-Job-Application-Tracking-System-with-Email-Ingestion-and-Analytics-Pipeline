const { connection } = require("../queue");

const MAX_APPLIES_PER_HOUR_PER_DOMAIN = 5;

function domainOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

/**
 * Returns true if an apply action to this domain is currently allowed,
 * and increments the counter as a side effect (token bucket via Redis INCR + TTL).
 */
async function allowApply(url) {
  const domain = domainOf(url);
  const key = `ratelimit:apply:${domain}`;
  const count = await connection.incr(key);
  if (count === 1) {
    await connection.expire(key, 3600); // 1 hour window
  }
  return count <= MAX_APPLIES_PER_HOUR_PER_DOMAIN;
}

function humanDelay(minMs = 800, maxMs = 2500) {
  const ms = Math.floor(Math.random() * (maxMs - minMs) + minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { allowApply, humanDelay, domainOf };
