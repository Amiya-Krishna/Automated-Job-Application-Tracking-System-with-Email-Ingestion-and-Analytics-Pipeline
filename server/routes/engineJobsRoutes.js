const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

router.get("/", async (req, res) => {
  try {
    const { status, minScore, page = 1, pageSize = 25 } = req.query;

    const skip = (Number(page) - 1) * Number(pageSize);
    const take = Number(pageSize);

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
      orderBy: [
        {
          match_scores: {
            _max: {
              score: "desc",
            },
          },
        },
        {
          scraped_at: "desc",
        },
      ],
      skip,
      take,
    });

    res.json({
      data: jobs,
      meta: { page: Number(page), pageSize: Number(pageSize) },
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
