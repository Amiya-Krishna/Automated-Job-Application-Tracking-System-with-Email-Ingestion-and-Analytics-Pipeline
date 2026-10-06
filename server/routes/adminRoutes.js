// Admin Panel API. Mounted with BOTH authMiddleware and requireAdmin (see server.js),
// so every route here is admin-only on the server regardless of what the UI shows.
const router = require("express").Router();
const prisma = require("../lib/prisma");
const { ADMIN_ROLE } = require("../middleware/requireAdmin");
const { deleteJob, deleteCompany, deleteSource, sendDeletionError } = require("../services/catalogDeletion");
const { STATUS } = require("../lib/accountStatus");
const { deleteUserAccount, LastAdminError } = require("../services/accountDeletion");

const parseId = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

// GET /api/admin/overview -> headline counts
router.get("/overview", async (req, res) => {
  try {
    const [users, admins, jobs, companies, sources, runs, blockedUsers] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: ADMIN_ROLE } }),
      prisma.jobs.count({ where: { owner_user_id: null } }),
      prisma.companies.count(),
      prisma.job_sources.count({ where: { scope: "global" } }),
      prisma.scrapeRun.count(),
      prisma.user.count({ where: { status: STATUS.BLOCKED } }),
    ]);
    res.json({ data: { users, admins, blockedUsers, jobs, companies, sources, discoveryRuns: runs } });
  } catch (err) {
    res.status(500).json({ message: "Could not load overview" });
  }
});

// ---------------------------------------------------------------------------------------------
// User management. Every route below is admin-only: this router is mounted behind authMiddleware +
// requireAdmin (server.js), and requireAdmin re-reads the caller's role AND status from the database
// on each request. The target user always comes from the URL path and is re-loaded from the
// database; nothing about the caller's identity ever comes from the request.
// ---------------------------------------------------------------------------------------------
const MAX_PAGE_SIZE = 200;
const parseInt10 = (v, d) => { const n = Number.parseInt(String(v), 10); return Number.isFinite(n) && n > 0 ? n : d; };

// GET /api/admin/users?q=&status=ACTIVE|BLOCKED&role=admin|user&page=1&pageSize=50
// -> { data: [user], meta: { total, page, pageSize } }. Only non-sensitive fields: never the
// password hash, tokens, refresh tokens or the Gmail grant (only a boolean "connected").
router.get("/users", async (req, res) => {
  try {
    const where = {};
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }];
    if (req.query.status !== undefined && req.query.status !== "") {
      const status = String(req.query.status).toUpperCase();
      if (status !== STATUS.ACTIVE && status !== STATUS.BLOCKED) return res.status(400).json({ message: 'status must be "ACTIVE" or "BLOCKED"' });
      where.status = status;
    }
    if (req.query.role !== undefined && req.query.role !== "") {
      if (req.query.role !== "admin" && req.query.role !== "user") return res.status(400).json({ message: 'role must be "admin" or "user"' });
      where.role = req.query.role;
    }
    const pageSize = Math.min(parseInt10(req.query.pageSize, 50), MAX_PAGE_SIZE);
    const page = parseInt10(req.query.page, 1);

    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true, role: true, status: true, createdAt: true, blockedAt: true, gmailRefreshToken: true, _count: { select: { trackedJobs: true } } },
        orderBy: { id: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // Last activity = most recent refresh/sign-in of any of the user's sessions (null for accounts
    // that have never signed in with a session-based client).
    const lastActive = new Map();
    if (rows.length && prisma.userSession && prisma.userSession.groupBy) {
      const groups = await prisma.userSession.groupBy({ by: ["userId"], where: { userId: { in: rows.map((u) => u.id) } }, _max: { lastUsedAt: true } });
      for (const g of groups) lastActive.set(g.userId, g._max && g._max.lastUsedAt ? g._max.lastUsedAt : null);
    }

    const data = rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role === ADMIN_ROLE ? ADMIN_ROLE : "user",
      status: u.status === STATUS.BLOCKED ? STATUS.BLOCKED : STATUS.ACTIVE,
      createdAt: u.createdAt,
      blockedAt: u.blockedAt || null,
      gmailConnected: Boolean(u.gmailRefreshToken),
      trackedJobs: u._count ? u._count.trackedJobs : 0,
      lastActiveAt: lastActive.get(u.id) || null,
    }));
    res.json({ data, meta: { total, page, pageSize } });
  } catch (err) {
    res.status(500).json({ message: "Could not load users" });
  }
});

// Shared guard for block / unblock / delete. Resolves the target or sends the error response
// (returns null). Rules, all enforced here on the server:
//   * id must be a positive integer                         -> 400
//   * an admin can never act on their OWN account           -> 400 cannot_modify_self
//   * the target must exist                                 -> 404
//   * administrators cannot be blocked / deleted here       -> 403 cannot_manage_admin
//     (demote them first with PATCH /users/:id/role - an admin cannot demote themselves, so there is
//      always at least one administrator and the last active admin can never be removed or blocked)
async function loadManageableTarget(req, res) {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ message: "Invalid user id" }); return null; }
  if (id === req.user.id) { res.status(400).json({ message: "You cannot block or delete your own account.", code: "cannot_modify_self" }); return null; }
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, status: true } });
  if (!target) { res.status(404).json({ message: "User not found" }); return null; }
  if (target.role === ADMIN_ROLE) {
    res.status(403).json({ message: "Administrator accounts cannot be blocked or deleted here. Change the role to user first.", code: "cannot_manage_admin" });
    return null;
  }
  return target;
}

const auditLog = (req, action, targetId) => console.log(`[admin-audit] admin#${req.user.id} ${action} user#${targetId}`);

// POST /api/admin/users/:id/block
// Marks the account BLOCKED, bumps its token version (kills every access token issued so far,
// including after a later unblock) and revokes all of its refresh-token sessions, in one
// transaction. NOTHING is deleted: the user's jobs, companies, notifications etc. stay intact.
router.post("/users/:id/block", async (req, res) => {
  try {
    const target = await loadManageableTarget(req, res);
    if (!target) return;
    if (target.status !== STATUS.BLOCKED) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: target.id }, data: { status: STATUS.BLOCKED, blockedAt: new Date(), tokenVersion: { increment: 1 } } });
        await tx.userSession.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
      });
      auditLog(req, "blocked", target.id);
    }
    res.json({ message: "User blocked", data: { id: target.id, status: STATUS.BLOCKED } });
  } catch (err) {
    res.status(500).json({ message: "Could not block user" });
  }
});

// POST /api/admin/users/:id/unblock — back to ACTIVE. Data is untouched and nothing is recreated.
// Tokens/sessions from before the block stay invalid; the user simply signs in again.
router.post("/users/:id/unblock", async (req, res) => {
  try {
    const target = await loadManageableTarget(req, res);
    if (!target) return;
    if (target.status !== STATUS.ACTIVE) {
      await prisma.user.update({ where: { id: target.id }, data: { status: STATUS.ACTIVE, blockedAt: null } });
      auditLog(req, "unblocked", target.id);
    }
    res.json({ message: "User unblocked", data: { id: target.id, status: STATUS.ACTIVE } });
  } catch (err) {
    res.status(500).json({ message: "Could not unblock user" });
  }
});

// DELETE /api/admin/users/:id — permanently deletes a normal user's account with the same rules as
// self-deletion (services/accountDeletion.js): private data removed in one transaction, global
// admin-fetched jobs/companies preserved, sessions removed so the account can never sign in again.
router.delete("/users/:id", async (req, res) => {
  try {
    const target = await loadManageableTarget(req, res);
    if (!target) return;
    const result = await deleteUserAccount(target.id);
    if (!result.deleted) return res.status(404).json({ message: "User not found" });
    auditLog(req, "deleted", target.id);
    res.json({ message: "User deleted", data: { id: target.id } });
  } catch (err) {
    if (err instanceof LastAdminError) return res.status(409).json({ message: err.message, code: err.code });
    res.status(500).json({ message: "Could not delete user" });
  }
});

// PATCH /api/admin/users/:id/role  { role: "admin" | "user" }
// An admin cannot change their own role, so the last admin can never lock everyone out.
router.patch("/users/:id/role", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const role = req.body && req.body.role;
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid user id" });
    if (role !== "admin" && role !== "user") return res.status(400).json({ message: 'role must be "admin" or "user"' });
    if (id === req.user.id) return res.status(400).json({ message: "You cannot change your own role." });
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!target) return res.status(404).json({ message: "User not found" });
    const updated = await prisma.user.update({ where: { id }, data: { role }, select: { id: true, name: true, email: true, role: true } });
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ message: "Could not update role" });
  }
});

const truthy = (v) => v === "true" || v === "1" || v === true;

// DELETE /api/admin/jobs/:id   (matched jobs = rows of the shared `jobs` catalog)
router.delete("/jobs/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid job id" });
  try { res.json({ message: "Job deleted", ...(await deleteJob(id)) }); } catch (err) { sendDeletionError(res, err); }
});

// DELETE /api/admin/companies/:id?withJobs=true
router.delete("/companies/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid company id" });
  try { res.json({ message: "Company deleted", ...(await deleteCompany(id, { withJobs: truthy(req.query.withJobs) })) }); } catch (err) { sendDeletionError(res, err); }
});

// DELETE /api/admin/sources/:id?withJobs=true
router.delete("/sources/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid source id" });
  try { res.json({ message: "Source deleted", ...(await deleteSource(id, { withJobs: truthy(req.query.withJobs) })) }); } catch (err) { sendDeletionError(res, err); }
});

module.exports = router;
