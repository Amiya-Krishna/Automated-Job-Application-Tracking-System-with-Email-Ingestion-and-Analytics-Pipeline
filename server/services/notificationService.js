// Per-user in-app notification inbox. EVERY function takes the owning user id and puts it in
// the query itself (WHERE user_id = ...), so a notification can only ever be created for, read
// by, counted for, marked read by, or deleted by its owner. There is intentionally no function
// here that touches notifications without a userId.
const prisma = require("../lib/prisma");

const KINDS = ["interview", "application", "job", "resume", "system"];
const clean = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

function assertUser(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) throw new Error("notifications: a valid user id is required");
  return id;
}

/** Creates a notification for ONE user. With a dedupeKey it is idempotent per user. */
async function createNotification(userId, { kind = "system", title, body = "", target = null, dedupeKey = null }, db = prisma) {
  const uid = assertUser(userId);
  if (!clean(title, 200)) throw new Error("notifications: title is required");
  try {
    return await db.notification.create({
      data: {
        userId: uid,
        kind: KINDS.includes(kind) ? kind : "system",
        title: clean(title, 200),
        body: clean(body, 500),
        target: target && typeof target === "object" ? target : undefined,
        dedupeKey: dedupeKey ? clean(dedupeKey, 200) : null,
      },
    });
  } catch (err) {
    if (err && err.code === "P2002") return null; // same dedupeKey already delivered to this user
    throw err;
  }
}

const shape = (n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, target: n.target, read: Boolean(n.readAt), createdAt: n.createdAt });

async function listForUser(userId, { limit = 50, unreadOnly = false } = {}, db = prisma) {
  const uid = assertUser(userId);
  const take = Math.min(100, Math.max(1, Number(limit) || 50));
  const where = { userId: uid, ...(unreadOnly ? { readAt: null } : {}) };
  const [rows, unreadCount] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take }),
    db.notification.count({ where: { userId: uid, readAt: null } }),
  ]);
  return { data: rows.map(shape), unreadCount };
}

const unreadCountForUser = (userId, db = prisma) => db.notification.count({ where: { userId: assertUser(userId), readAt: null } });

/** Returns true if a row of THIS user was changed; false (-> 404) for a missing or foreign id. */
async function markRead(userId, id, db = prisma) {
  const r = await db.notification.updateMany({ where: { id: Number(id), userId: assertUser(userId), readAt: null }, data: { readAt: new Date() } });
  if (r.count) return true;
  return Boolean(await db.notification.findFirst({ where: { id: Number(id), userId: assertUser(userId) }, select: { id: true } }));
}

const markAllRead = async (userId, db = prisma) => (await db.notification.updateMany({ where: { userId: assertUser(userId), readAt: null }, data: { readAt: new Date() } })).count;

const deleteOne = async (userId, id, db = prisma) => (await db.notification.deleteMany({ where: { id: Number(id), userId: assertUser(userId) } })).count > 0;

const deleteAll = async (userId, db = prisma) => (await db.notification.deleteMany({ where: { userId: assertUser(userId) } })).count;

module.exports = { shape, createNotification, listForUser, unreadCountForUser, markRead, markAllRead, deleteOne, deleteAll };
