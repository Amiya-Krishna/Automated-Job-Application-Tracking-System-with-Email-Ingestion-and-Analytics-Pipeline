const jwt = require("jsonwebtoken");

// Reads the JWT from the legacy `token` header (web, extension, mobile) or the
// standard `Authorization: Bearer` header.
//
// Status codes: a missing / expired / invalid token is HTTP 401 so clients can
// react uniformly (mobile refreshes its session; web signs out). It used to be
// 400 for an invalid token, which clients cannot distinguish from a validation
// error.
//
// Only real session tokens are accepted. Short-lived purpose tokens signed with
// the same secret (password reset, Gmail OAuth `state`) carry `purpose` and
// must never work as a login token.
function readToken(req) {
  const header = req.header("token");
  if (header) return header;
  const auth = req.header("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? m[1].trim() : null;
}

module.exports = function authMiddleware(req, res, next) {
  const token = readToken(req);

  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied", code: "no_token" });
  }

  let verified;
  try {
    verified = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    const expired = err && err.name === "TokenExpiredError";
    return res.status(401).json({
      message: expired ? "Session expired" : "Token is not valid",
      code: expired ? "token_expired" : "token_invalid",
    });
  }

  if (!verified || typeof verified !== "object" || verified.purpose || (verified.typ && verified.typ !== "access") || !verified.id) {
    return res.status(401).json({ message: "Token is not valid", code: "token_invalid" });
  }

  req.user = verified;
  next();
};
