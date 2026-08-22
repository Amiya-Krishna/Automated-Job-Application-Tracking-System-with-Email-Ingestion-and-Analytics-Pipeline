const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const prisma = require("../lib/prisma");
const { scrapeQueue } = require("../queue");
const { allowAction } = require("../services/rateLimiter");
const { ADAPTERS } = require("../services/jobDiscovery");

const VALID_SOURCES = Object.keys(ADAPTERS); // ["linkedin", "indeed"]
const MAX_RUNS_PER_HOUR = 6;
const MAX_LIMIT_PER_SOURCE = 50;

// POST /api/scrape/run — trigger a discovery run for the given query.
router.post("/run", auth, async (req, res) => {
  try {
    const { query, location, sources, limit } = req.body || {};

    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(400).json({ message: "query is required" });
    }
    if (query.length > 255) {
      return res.status(400).json({ message: "query must be under 255 characters" });
    }

    const requestedSources = Array.isArray(sources) && sources.length ? sources : VALID_SOURCES;
    const invalidSources = requestedSources.filter((s) => !VALID_SOURCES.includes(s));
    if (invalidSources.length) {
      return res.status(400).json({
        message: `Unknown source(s): ${invalidSources.join(", ")}. Valid sources: ${VALID_SOURCES.join(", ")}`,
      });
    }

    const parsedLimit = Number(limit) || 25;
    if (parsedLimit < 1 || parsedLimit > MAX_LIMIT_PER_SOURCE) {
      return res.status(400).json({
        message: `limit must be between 1 and ${MAX_LIMIT_PER_SOURCE}`,
      });
    }

    const allowed = await allowAction(
      `ratelimit:scrape:user:${req.user.id}`,
      MAX_RUNS_PER_HOUR,
      3600,
    );
    if (!allowed) {
      return res.status(429).json({
        message: `You can trigger at most ${MAX_RUNS_PER_HOUR} discovery runs per hour. Try again later.`,
      });
    }

    const scrapeRun = await prisma.scrapeRun.create({
      data: {
        userId: req.user.id,
        query: query.trim(),
        location: location?.trim() || null,
        sources: requestedSources,
        limitPerSource: parsedLimit,
        status: "queued",
      },
    });

    // Enqueue and return immediately — the scrape worker does the actual
    // adapter calls + ingestion off the request thread.
    const bullJob = await scrapeQueue.add(
      "discover",
      {
        scrapeRunId: scrapeRun.id,
        query: query.trim(),
        location: location?.trim() || null,
        sources: requestedSources,
        limit: parsedLimit,
      },
      { attempts: 2, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: true },
    );

    await prisma.scrapeRun.update({
      where: { id: scrapeRun.id },
      data: { bullJobId: String(bullJob.id) },
    });

    res.status(202).json({
      status: "queued",
      runId: scrapeRun.id,
      sources: requestedSources,
    });
  } catch (err) {
    console.error("[scrapeRoutes]", err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/scrape/runs/:id — poll run status.
router.get("/runs/:id", auth, async (req, res) => {
  try {
    const run = await prisma.scrapeRun.findFirst({
      where: { id: Number(req.params.id), userId: req.user.id },
    });
    if (!run) return res.status(404).json({ message: "Run not found" });
    res.json({ data: run });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/scrape/runs — recent run history for the dashboard control.
router.get("/runs", auth, async (req, res) => {
  try {
    const runs = await prisma.scrapeRun.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    res.json({ data: runs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
