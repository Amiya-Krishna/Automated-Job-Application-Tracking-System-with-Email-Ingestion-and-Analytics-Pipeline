const router = require("express").Router();
const { ingestQueue } = require("../queue");
const { contentHash } = require("../services/textUtils");
const { normalizeOrigin } = require("../services/visibility");

// User capture entrypoint (browser-extension "save job"). Mounted behind `auth` only, so it
// can NEVER create global jobs: whatever sourceName the client sends, the job is private to
// the authenticated user (origin manual/gmail/extension, see services/visibility.js).
// Global jobs come only from the admin-only scrape/discovery paths, which call
// ingestionService directly.
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
    const { origin } = normalizeOrigin(sourceName === "gmail" ? "gmail" : "extension", sourceName);
    const payload = {
      title,
      company,
      description,
      location,
      remoteType,
      sourceName: origin,
      ownerUserId: req.user.id,
      sourceUrl,
      externalJobId,
      postedAt,
    };

    const jobId = externalJobId
      ? `ingest:${origin}:u${req.user.id}:${externalJobId}`
      : `ingest:${origin}:u${req.user.id}:${contentHash(payload)}`;

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
