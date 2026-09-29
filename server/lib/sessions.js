// Access-token + rotating refresh-token sessions.
//
//  - Access tokens are short-lived JWTs ({ id, sid, typ: "access" }) sent in
//    the existing `token` header (or `Authorization: Bearer`).
//  - Refresh tokens are opaque 256-bit random strings. Only their SHA-256 hash
//    is stored (table user_sessions), so a database leak cannot be replayed.
//  - Every refresh ROTATES the token. Presenting an already-rotated token
//    (theft/replay) revokes the whole rotation family.
//  - Web/extension clients are untouched: they keep the legacy 7-day JWT.
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const prisma = require("./prisma");

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const ACCESS_TTL_SECONDS = () => num(process.env.ACCESS_TOKEN_TTL_SECONDS, 15 * 60);
const REFRESH_TTL_DAYS = () => num(process.env.REFRESH_TOKEN_TTL_DAYS, 60);
// A rotated token may be presented again for a few seconds (lost response /
// two in-flight requests) without being treated as theft.
const REUSE_GRACE_MS = () => num(process.env.REFRESH_REUSE_GRACE_SECONDS, 10) * 1000;

const hashToken = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
const newRefreshToken = () => crypto.randomBytes(32).toString("base64url");

function clean(v, max) {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function signAccessToken(userId, sessionId) {
  const expiresIn = ACCESS_TTL_SECONDS();
  const token = jwt.sign({ id: userId, sid: sessionId, typ: "access" }, process.env.JWT_SECRET, { expiresIn });
  return { token, expiresIn, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
}

async function issueSession(user, device = {}, familyId = crypto.randomUUID()) {
  const refreshToken = newRefreshToken();
  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      familyId,
      refreshTokenHash: hashToken(refreshToken),
      deviceName: clean(device.deviceName, 120),
      platform: clean(device.platform, 20),
      appVersion: clean(device.appVersion, 40),
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS() * 86400 * 1000),
    },
  });
  const access = signAccessToken(user.id, session.id);
  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    expiresIn: access.expiresIn,
    refreshToken,
    sessionId: session.id,
  };
}

// Returns { ok:true, ...tokens, user } or { ok:false, reason }.
async function rotateSession(refreshToken, device = {}) {
  if (typeof refreshToken !== "string" || refreshToken.length < 20 || refreshToken.length > 200) {
    return { ok: false, reason: "invalid" };
  }
  const row = await prisma.userSession.findUnique({ where: { refreshTokenHash: hashToken(refreshToken) } });
  if (!row) return { ok: false, reason: "invalid" };

  const now = Date.now();
  if (row.revokedAt) return { ok: false, reason: "revoked" };
  if (row.expiresAt.getTime() <= now) return { ok: false, reason: "expired" };

  if (row.rotatedAt) {
    // Already exchanged once. Inside the grace window we treat it as a benign
    // retry (but issue nothing: the client must use the newer token it got).
    if (now - row.rotatedAt.getTime() <= REUSE_GRACE_MS()) return { ok: false, reason: "reused_recently" };
    await revokeFamily(row.familyId);
    return { ok: false, reason: "reuse_detected" };
  }

  const user = await prisma.user.findUnique({ where: { id: row.userId } });
  if (!user) return { ok: false, reason: "invalid" };

  await prisma.userSession.update({ where: { id: row.id }, data: { rotatedAt: new Date(), lastUsedAt: new Date() } });
  const issued = await issueSession(
    user,
    { deviceName: device.deviceName ?? row.deviceName, platform: device.platform ?? row.platform, appVersion: device.appVersion ?? row.appVersion },
    row.familyId,
  );
  return { ok: true, ...issued, user };
}

async function revokeByRefreshToken(refreshToken) {
  if (typeof refreshToken !== "string" || !refreshToken) return 0;
  const row = await prisma.userSession.findUnique({ where: { refreshTokenHash: hashToken(refreshToken) } });
  if (!row) return 0;
  const r = await prisma.userSession.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  return r.count;
}

async function revokeFamily(familyId) {
  const r = await prisma.userSession.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  return r.count;
}

async function revokeAllForUser(userId) {
  const r = await prisma.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  return r.count;
}

// Housekeeping: delete sessions that expired more than 7 days ago.
async function purgeExpiredSessions() {
  return prisma.userSession.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 86400 * 1000) } } });
}

module.exports = {
  issueSession,
  rotateSession,
  revokeByRefreshToken,
  revokeFamily,
  revokeAllForUser,
  purgeExpiredSessions,
  signAccessToken,
  hashToken,
  ACCESS_TTL_SECONDS,
};
