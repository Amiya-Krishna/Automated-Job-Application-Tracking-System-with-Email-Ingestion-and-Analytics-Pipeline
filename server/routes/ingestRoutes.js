const router = require("express").Router();
const { ingestQueue } = require("../queue");
const { contentHash } = require("../services/textUtils");

// Shared entrypoint for both capture paths: the Playwright scheduled scraper
// and the existing browser-extension "save job" action.
router.post("/", async (req, res) => {
  try {
    const {
      title,
      company,
      description,
      location,
      remoteType,
      sourceName,
      sourceUrl,
      externalJobId,
      postedAt,
    } = req.body;
    if (!title || !company || !description || !sourceName || !sourceUrl) {
      return res
        .status(400)
        .json({
          message:
            "title, company, description, sourceName, sourceUrl are required",
        });
    }
    const payload = {
      title,
      company,
      description,
      location,
      remoteType,
      sourceName,
      sourceUrl,
      externalJobId,
      postedAt,
    };

    const jobId = externalJobId
      ? `ingest:${sourceName}:${externalJobId}`
      : `ingest:${sourceName}:${contentHash(payload)}`;

    // Why: enqueueing here keeps HTTP latency stable. The worker does the
    // database writes, dedup checks, and downstream matching after the
    // request returns.
    const job = await ingestQueue.add("ingest", payload, {
      jobId,
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    });

    res.status(202).json({
      status: "queued",
      queue: "ingest",
      jobId: job.id,
    });
  } catch (err) {
    console.error("[ingestRoutes]", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
