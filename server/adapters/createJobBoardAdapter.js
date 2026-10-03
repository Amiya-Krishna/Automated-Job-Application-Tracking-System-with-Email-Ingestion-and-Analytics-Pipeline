const { chromium } = require("playwright");

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

// Shared Playwright-based discovery adapter for job boards (LinkedIn, Indeed).
// `scrape(query, context, { location, limit })` does the board-specific work.
function createJobBoardAdapter({ name, label, scrape }) {
  async function discover({ query, location, limit }) {
    const parsedLimit = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    let browser;
    let context;
    try {
      browser = await chromium.launch({ headless: process.env.PLAYWRIGHT_HEADLESS !== "false" });
      context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        viewport: { width: 1366, height: 850 },
        locale: "en-US",
      });

      const jobs = await scrape(query, context, { location, limit: parsedLimit });
      const normalized = jobs
        .filter((job) => job.title && job.sourceUrl)
        .map((job) => ({
          ...job,
          sourceName: name,
          description: job.description || "",
          remoteType: job.remoteType || null,
          externalJobId: job.externalJobId || job.sourceUrl,
        }));

      return {
        source: name,
        status: "ok",
        message: null,
        jobs: normalized,
      };
    } catch (err) {
      return {
        source: name,
        status: "error",
        message: `${label} discovery failed: ${err.message}`,
        jobs: [],
      };
    } finally {
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }

  return { name, discover, AVAILABLE: true };
}

module.exports = { createJobBoardAdapter };
