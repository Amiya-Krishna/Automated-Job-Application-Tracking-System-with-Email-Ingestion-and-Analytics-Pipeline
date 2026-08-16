const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// GET /api/sources -> browses the `job_sources` table (LinkedIn, Indeed,
// etc — everywhere the scraper/ingestion pipeline pulls jobs from), with a
// job count per source so the UI can show how productive each one is.
router.get("/", async (req, res) => {
  try {
    const sources = await prisma.job_sources.findMany({
      include: {
        _count: { select: { jobs: true } },
      },
      orderBy: { name: "asc" },
    });

    res.json({
      data: sources.map((s) => ({
        id: s.id,
        name: s.name,
        baseUrl: s.base_url,
        createdAt: s.created_at,
        jobCount: s._count.jobs,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sources/:id -> a single source with its most recent jobs.
router.get("/:id", async (req, res) => {
  try {
    const source = await prisma.job_sources.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        jobs: {
          select: {
            id: true,
            title: true,
            status: true,
            location: true,
            posted_at: true,
            source_url: true,
            companies: { select: { name: true } },
          },
          orderBy: { scraped_at: "desc" },
          take: 25,
        },
      },
    });

    if (!source) {
      return res.status(404).json({ message: "Source not found" });
    }

    res.json({ data: source });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
