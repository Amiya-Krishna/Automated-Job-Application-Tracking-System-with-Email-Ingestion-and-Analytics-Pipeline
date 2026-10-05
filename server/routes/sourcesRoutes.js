const router = require("express").Router();
const prisma = require("../lib/prisma");
const { GLOBAL_SOURCES, PRIVATE_SOURCES } = require("../services/visibility");

// SOURCES - one page, two audiences, decided by the server (never by the client):
//
//   normal user -> ONLY the private sources: Manual, Gmail, Extension - with ONLY that user's
//                  own jobs/counts (tracked_jobs.user_id = caller).
//   admin       -> ONLY the admin-fetched global sources: LinkedIn, Naukri, Remotive, Unstop,
//                  Indeed, Wellfound, Internshala - with the global (ownerless) jobs. An admin
//                  never sees any user's private Manual/Gmail/Extension data here.
//
// The audience comes from the user's role in the DATABASE on every request. The source list is
// restricted by job_sources.scope in the query itself, and a detail request for a source of the
// other audience is a 404 - so changing an id in the URL exposes nothing.
async function audience(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true } });
    if (!user) return res.status(401).json({ message: "Account no longer exists", code: "token_invalid" });
    req.audience = user.role === "admin" ? "admin" : "user";
    next();
  } catch (err) {
    console.error("[sourcesRoutes] audience lookup failed:", err.code || err.name);
    res.status(500).json({ message: "Could not verify permissions" });
  }
}
router.use(audience);

const scopeFor = (aud) => (aud === "admin" ? "global" : "private");

// Tracked-job filter for one private source of THIS user. Rows saved before origins were
// normalised can carry a website name (e.g. "linkedin") from the extension; those that were not
// applied from the catalog (no engine_job_id) still belong to Extension.
function trackedWhere(userId, sourceName) {
  const key = String(sourceName).toLowerCase();
  if (key === "manual") return { userId, OR: [{ sourceName: "manual" }, { sourceName: null }] };
  if (key === "gmail") return { userId, sourceName: "gmail" };
  return {
    userId,
    OR: [
      { sourceName: "extension" },
      { sourceName: { in: [...GLOBAL_SOURCES] }, engineJobId: null },
    ],
  };
}

router.get("/", async (req, res) => {
  try {
    const sources = await prisma.job_sources.findMany({
      where: { scope: scopeFor(req.audience) },
      orderBy: { name: "asc" },
    });

    let countFor;
    if (req.audience === "admin") {
      const grouped = await prisma.jobs.groupBy({
        by: ["source_id"],
        where: { owner_user_id: null, status: { not: "duplicate" } },
        _count: { _all: true },
      });
      const bySource = new Map(grouped.map((g) => [g.source_id, g._count._all]));
      countFor = (s) => bySource.get(s.id) || 0;
    } else {
      const counts = new Map();
      await Promise.all(
        sources.map(async (s) => {
          counts.set(s.id, await prisma.trackedJob.count({ where: trackedWhere(req.user.id, s.name) }));
        }),
      );
      countFor = (s) => counts.get(s.id) || 0;
    }

    res.json({
      data: sources.map((s) => ({
        id: s.id,
        name: s.name,
        // the website of a fetched source is only meaningful to the admin
        baseUrl: req.audience === "admin" ? s.base_url : null,
        scope: s.scope,
        createdAt: s.created_at,
        jobCount: countFor(s),
      })),
      meta: { audience: req.audience },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ message: "Source not found" });
    // scope in the WHERE: a source of the other audience simply does not exist for this caller
    const source = await prisma.job_sources.findFirst({ where: { id, scope: scopeFor(req.audience) } });
    if (!source) return res.status(404).json({ message: "Source not found" });

    if (req.audience === "admin") {
      const jobs = await prisma.jobs.findMany({
        where: { source_id: source.id, owner_user_id: null, status: { not: "duplicate" } },
        select: {
          id: true, title: true, status: true, location: true, posted_at: true, source_url: true,
          companies: { select: { name: true } },
        },
        orderBy: { scraped_at: "desc" },
        take: 25,
      });
      return res.json({ data: { id: source.id, name: source.name, baseUrl: source.base_url, scope: source.scope, createdAt: source.created_at, jobs } });
    }

    const trackedJobs = await prisma.trackedJob.findMany({
      where: trackedWhere(req.user.id, source.name),
      select: { id: true, company: true, role: true, status: true, location: true, applicationDate: true, sourceUrl: true, platform: true },
      orderBy: { applicationDate: "desc" },
      take: 25,
    });
    res.json({ data: { id: source.id, name: source.name, baseUrl: null, scope: source.scope, createdAt: source.created_at, trackedJobs } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
module.exports.PRIVATE_SOURCES = PRIVATE_SOURCES;
