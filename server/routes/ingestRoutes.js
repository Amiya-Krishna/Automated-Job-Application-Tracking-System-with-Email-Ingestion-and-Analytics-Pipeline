const router = require("express").Router();
const { ingestJob } = require("../services/ingestionService");

// Shared entrypoint for both capture paths: the Playwright scheduled scraper
// and the existing browser-extension "save job" action.
router.post("/", async (req, res) => {
  try {
    const { title, company, description, location, remoteType, sourceName, sourceUrl, externalJobId, postedAt } = req.body;
    if (!title || !company || !description || !sourceName || !sourceUrl) {
      return res.status(400).json({ message: "title, company, description, sourceName, sourceUrl are required" });
    }
    const result = await ingestJob({
      title, company, description, location, remoteType,
      sourceName, sourceUrl, externalJobId, postedAt,
    });
    res.status(201).json(result);
  } catch (err) {
    console.error("[ingestRoutes]", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
