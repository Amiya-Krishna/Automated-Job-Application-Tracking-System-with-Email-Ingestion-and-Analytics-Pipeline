const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

router.get("/", async (req, res) => {
  try {
    const { status, minScore, page = 1, pageSize = 25 } = req.query;

    const pageNum = Number(page);
    const pageSizeNum = Number(pageSize);

    // Prisma's relation `orderBy` only supports `_count` for to-many
    // relations (not `_max`/`_min`/`_avg`), so ordering by "best match
    // score" can't be done at the DB level here without a raw query.
    // Fetch the filtered set ordered by scraped_at, compute each job's
    // best tfidf score in JS, sort by that, then paginate in memory.
    const jobs = await prisma.jobs.findMany({
      where: {
        ...(status && { status }),
        ...(minScore && {
          match_scores: {
            some: {
              score: {
                gte: Number(minScore),
              },
              method: "tfidf",
            },
          },
        }),
      },
      include: {
        companies: {
          select: { name: true },
        },
        match_scores: {
          where: { method: "tfidf" },
          select: { score: true, explanation: true },
        },
      },
      orderBy: {
        scraped_at: "desc",
      },
      take: 500,
    });

    const bestScore = (job) =>
      job.match_scores.length
        ? Math.max(...job.match_scores.map((m) => Number(m.score)))
        : -1;

    jobs.sort((a, b) => bestScore(b) - bestScore(a));

    const skip = (pageNum - 1) * pageSizeNum;
    const pageJobs = jobs.slice(skip, skip + pageSizeNum);

    res.json({
      data: pageJobs,
      meta: { page: pageNum, pageSize: pageSizeNum, total: jobs.length },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const job = await prisma.jobs.findUnique({
      where: {
        id: Number(req.params.id),
      },
      include: {
        companies: {
          select: { name: true },
        },
        match_scores: {
          where: { method: "tfidf" },
          select: { score: true, explanation: true },
        },
      },
    });

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    res.json({ data: job });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;