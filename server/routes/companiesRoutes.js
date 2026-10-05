const router = require("express").Router();
const prisma = require("../lib/prisma");
const { normalize } = require("../services/textUtils");
const { visibleJobsWhere } = require("../services/visibility");

// A user may see a company when it is reachable through
//   (a) a GLOBAL admin-fetched job (LinkedIn, Naukri, Remotive, Unstop, Indeed, Wellfound,
//       Internshala), or
//   (b) one of THEIR OWN private jobs (manual / gmail / extension) - either an engine job they
//       own or a tracked job they saved.
// A company that exists only because ANOTHER user saved a private job is invisible: not in the
// list, not in counts or search, and 404 by id. The `companies` table is shared, so visibility is
// computed here per request - never from a flag on the company.
const realJobs = (userId) => ({ AND: [visibleJobsWhere(userId), { status: { not: "duplicate" } }] });

async function ownTrackedCompanyKeys(userId) {
  const rows = await prisma.trackedJob.findMany({
    where: { userId },
    select: { company: true },
    distinct: ["company"],
  });
  return [...new Set(rows.map((r) => normalize(r.company)).filter(Boolean))];
}

const visibleCompaniesWhere = (userId, trackedKeys) => ({
  OR: [
    { jobs: { some: realJobs(userId) } },
    ...(trackedKeys.length ? [{ normalized_name: { in: trackedKeys } }] : []),
  ],
});

// GET /api/companies?search=acme&page=1&pageSize=25
router.get("/", async (req, res) => {
  try {
    const { search, page = 1, pageSize = 25 } = req.query;
    const pageNum = Math.max(1, Number(page) || 1);
    const pageSizeNum = Math.min(100, Math.max(1, Number(pageSize) || 25));
    const trackedKeys = await ownTrackedCompanyKeys(req.user.id);

    const and = [visibleCompaniesWhere(req.user.id, trackedKeys)];
    if (search) {
      and.push({
        OR: [
          { name: { contains: String(search), mode: "insensitive" } },
          { domain: { contains: String(search), mode: "insensitive" } },
        ],
      });
    }
    const where = { AND: and };

    const [companies, total] = await Promise.all([
      prisma.companies.findMany({
        where,
        include: { _count: { select: { jobs: { where: realJobs(req.user.id) } } } },
        orderBy: { name: "asc" },
        skip: (pageNum - 1) * pageSizeNum,
        take: pageSizeNum,
      }),
      prisma.companies.count({ where }),
    ]);

    res.json({
      data: companies.map((c) => ({
        id: c.id,
        name: c.name,
        normalizedName: c.normalized_name,
        domain: c.domain,
        createdAt: c.created_at,
        // only jobs THIS user may see
        jobCount: c._count.jobs,
      })),
      meta: { page: pageNum, pageSize: pageSizeNum, total },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/companies/:id -> a company with its most recent jobs THIS user may see.
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ message: "Company not found" });
    const trackedKeys = await ownTrackedCompanyKeys(req.user.id);

    const company = await prisma.companies.findFirst({
      where: { AND: [{ id }, visibleCompaniesWhere(req.user.id, trackedKeys)] },
      include: {
        jobs: {
          where: realJobs(req.user.id),
          select: {
            id: true,
            title: true,
            status: true,
            location: true,
            remote_type: true,
            posted_at: true,
            source_url: true,
          },
          orderBy: { scraped_at: "desc" },
          take: 25,
        },
      },
    });

    // not visible == not found (no existence oracle for other users' private companies)
    if (!company) return res.status(404).json({ message: "Company not found" });
    res.json({ data: company });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
