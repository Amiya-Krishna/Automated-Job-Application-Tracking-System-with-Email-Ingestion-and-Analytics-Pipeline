// Authorization gate for admin-only API routes. Mount AFTER authMiddleware
// (it needs req.user.id from the verified access token).
//
// The role is deliberately read from the database on every request rather
// than from the JWT: tokens live up to 7 days (web/extension) and a demoted
// admin must lose access immediately. Nothing the client sends (body, query,
// headers) is ever consulted. Fails closed: any lookup problem is a 403/500,
// never a pass-through.
const prisma = require("../lib/prisma");
const { isActive, sendBlocked } = require("../lib/accountStatus");

const ADMIN_ROLE = "admin";

async function requireAdmin(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "No token, authorization denied", code: "no_token" });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, role: true, status: true } });
    if (!user) {
      return res.status(401).json({ message: "Account no longer exists", code: "token_invalid" });
    }
    if (!isActive(user)) return sendBlocked(res);
    if (user.role !== ADMIN_ROLE) {
      return res.status(403).json({ message: "Administrator access required", code: "admin_required" });
    }
    req.user.role = user.role;
    return next();
  } catch (err) {
    console.error(`[requireAdmin] ${req.method} ${req.path} failed: ${(err && (err.code || err.name)) || "unknown"}`);
    return res.status(500).json({ message: "Could not verify permissions" });
  }
}

module.exports = requireAdmin;
module.exports.ADMIN_ROLE = ADMIN_ROLE;
