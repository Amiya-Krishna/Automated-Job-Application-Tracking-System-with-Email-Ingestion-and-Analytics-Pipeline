const { chromium } = require("playwright");
const { scrapeLinkedIn } = require("../services/scraper");

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

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

    const jobs = await scrapeLinkedIn(query, context, { location, limit: parsedLimit });
    const normalized = jobs
      .filter((job) => job.title && job.sourceUrl)
      .map((job) => ({
        ...job,
        sourceName: "linkedin",
        description: job.description || "",
        remoteType: job.remoteType || null,
        externalJobId: job.externalJobId || job.sourceUrl,
      }));

    return {
      source: "linkedin",
      status: "ok",
      message: null,
      jobs: normalized,
    };
  } catch (err) {
    return {
      source: "linkedin",
      status: "error",
      message: `LinkedIn discovery failed: ${err.message}`,
      jobs: [],
    };
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { name: "linkedin", discover, AVAILABLE: true };
