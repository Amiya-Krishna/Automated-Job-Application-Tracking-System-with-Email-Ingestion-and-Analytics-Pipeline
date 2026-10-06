const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");
const { isActive, sendBlocked, tokenVersionOf, DELETED_MESSAGE } = require("../lib/accountStatus");

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
//
// A valid signature is NOT enough: the account is looked up on every request so that
//   * a deleted account is rejected at once            -> 401 token_invalid
//   * a blocked account is rejected at once            -> 403 account_blocked
//   * a token minted before the account was blocked
//     (token version `tv` no longer matches) stays dead -> 401 token_invalid
// This is what makes a block/delete effective for access tokens that are still unexpired
// (15 min for mobile/web/extension, 7 days for the legacy header token). Fails closed:
// a lookup problem is a 500, never a pass-through.
function readToken(req) {
  const header = req.header("token");
  if (header) return header;
  const auth = req.header("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? m[1].trim() : null;
}

module.exports = async function authMiddleware(req, res, next) {
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

  try {
    const account = await prisma.user.findUnique({
      where: { id: verified.id },
      select: { id: true, status: true, tokenVersion: true },
    });
    if (!account) {
      return res.status(401).json({ message: DELETED_MESSAGE, code: "token_invalid" });
    }
    if (!isActive(account)) {
      return sendBlocked(res);
    }
    if ((Number.isInteger(verified.tv) ? verified.tv : 0) !== tokenVersionOf(account)) {
      return res.status(401).json({ message: "Session expired", code: "token_invalid" });
    }
  } catch (err) {
    console.error(`[auth] ${req.method} ${req.path} account check failed: ${(err && (err.code || err.name)) || "unknown"}`);
    return res.status(500).json({ message: "Could not verify your account" });
  }

  req.user = verified;
  next();
};
