// CORS policy for the API, kept in its own module so it can be unit-tested.
//
// The allow-list itself is unchanged: CLIENT_URL origins + Chrome extension
// origins (always), plus anything in development. What this module fixes is
// HOW a non-allowed request is answered:
//   * a request with no Origin header (mobile app, curl, uptime pings,
//     same-origin) used to crash the callback with
//     "Cannot read properties of undefined (reading 'startsWith')" -> HTTP 500;
//   * a disallowed browser origin used to surface as a generic HTTP 500.
// Now neither throws: a disallowed origin is answered 403 and receives no
// CORS headers, so browsers still cannot read the response. No origin is ever
// added to the allow-list by this change.
function parseAllowedOrigins(raw = process.env.CLIENT_URL) {
  return String(raw || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin, { allowedOrigins, nodeEnv = process.env.NODE_ENV } = {}) {
  const list = allowedOrigins || parseAllowedOrigins();
  const production = nodeEnv === "production";
  if (!origin) return !production; // non-browser callers: allowed (headers-wise) only outside production
  if (!production && list.length === 0) return true;
  return list.includes(origin) || origin.startsWith("chrome-extension://");
}

function buildCorsOptions({ allowedOrigins = parseAllowedOrigins(), nodeEnv = process.env.NODE_ENV } = {}) {
  return {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin, { allowedOrigins, nodeEnv })) return callback(null, true);
      // No Origin header at all: not a browser cross-origin call, so there is
      // nothing for CORS to protect. Continue WITHOUT CORS headers; the route's
      // own authentication still applies.
      if (!origin) return callback(null, false);
      const err = new Error("Not allowed by CORS");
      err.status = 403;
      return callback(err);
    },
    credentials: true,
    // lets the browser read the filename of resume exports cross-origin
    exposedHeaders: ["Content-Disposition"],
  };
}

module.exports = { buildCorsOptions, isAllowedOrigin, parseAllowedOrigins };
