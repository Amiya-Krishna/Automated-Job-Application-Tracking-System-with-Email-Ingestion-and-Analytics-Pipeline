// Admin Panel API. Mounted with BOTH authMiddleware and requireAdmin (see server.js),
// so every route here is admin-only on the server regardless of what the UI shows.
const router = require("express").Router();
const prisma = require("../lib/prisma");
const { ADMIN_ROLE } = require("../middleware/requireAdmin");
const { deleteJob, deleteCompany, deleteSource, sendDeletionError } = require("../services/catalogDeletion");

// GET /api/admin/overview -> headline counts
router.get("/overview", async (req, res) => {
  try {
    const [users, admins, jobs, companies, sources, runs] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: ADMIN_ROLE } }),
      prisma.jobs.count({ where: { owner_user_id: null } }),
      prisma.companies.count(),
      prisma.job_sources.count({ where: { scope: "global" } }),
      prisma.scrapeRun.count(),
    ]);
    res.json({ data: { users, admins, jobs, companies, sources, discoveryRuns: runs } });
  } catch (err) {
    res.status(500).json({ message: "Could not load overview" });
  }
});

// GET /api/admin/users -> accounts and roles (never password hashes or tokens)
router.get("/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, createdAt: true }, orderBy: { id: "asc" }, take: 500 });
    res.json({ data: users });
  } catch (err) {
    res.status(500).json({ message: "Could not load users" });
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

const parseId = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
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
