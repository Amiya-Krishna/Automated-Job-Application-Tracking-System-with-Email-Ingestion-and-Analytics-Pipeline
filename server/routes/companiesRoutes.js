const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// GET /api/companies?search=acme&page=1&pageSize=25
// Browses the `companies` table (deduped employers discovered by the
// scraper/ingestion pipeline), with a job count per company.
router.get("/", async (req, res) => {
  try {
    const { search, page = 1, pageSize = 25 } = req.query;
    const pageNum = Number(page);
    const pageSizeNum = Number(pageSize);

    const where = search
      ? {
          OR: [
            { name: { contains: String(search), mode: "insensitive" } },
            { domain: { contains: String(search), mode: "insensitive" } },
          ],
        }
      : {};

    const [companies, total] = await Promise.all([
      prisma.companies.findMany({
        where,
        include: {
          _count: { select: { jobs: true } },
        },
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
        jobCount: c._count.jobs,
      })),
      meta: { page: pageNum, pageSize: pageSizeNum, total },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/companies/:id -> a single company with its most recent jobs.
router.get("/:id", async (req, res) => {
  try {
    const company = await prisma.companies.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        jobs: {
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

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    res.json({ data: company });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
