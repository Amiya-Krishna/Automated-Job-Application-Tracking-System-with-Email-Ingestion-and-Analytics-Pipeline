// Scheduled scraper skeleton. Selectors below are illustrative — LinkedIn and
// Indeed change their DOM often enough that you should expect to update
// these every few weeks; that fragility is itself worth a line in your
// interview notes (see design doc, section 10).
//
// Run manually with `node services/scraper.js`, or wire into a BullMQ
// repeatable job (see queue/index.js) for a real schedule.

const { chromium } = require("playwright");
const { ingestJob } = require("./ingestionService");

async function scrapeLinkedIn(searchQuery, context) {
  const page = await context.newPage();
  await page.goto(
    `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(searchQuery)}`,
    { waitUntil: "domcontentloaded" }
  );
  await page.waitForSelector(".jobs-search__results-list", { timeout: 15000 }).catch(() => {});

  const cards = await page.$$eval(".jobs-search__results-list li", (nodes) =>
    nodes.slice(0, 25).map((n) => ({
      title: n.querySelector(".base-search-card__title")?.innerText?.trim(),
      company: n.querySelector(".base-search-card__subtitle")?.innerText?.trim(),
      location: n.querySelector(".job-search-card__location")?.innerText?.trim(),
      sourceUrl: n.querySelector("a.base-card__full-link")?.href,
    }))
  );

  const results = [];
  for (const card of cards) {
    if (!card.title || !card.sourceUrl) continue;
    // LinkedIn's search results page doesn't include the full description —
    // you'd navigate into each card's URL for that in a real implementation.
    // Left as a follow-up call rather than inlined here to keep the scrape
    // pass fast; fetch descriptions lazily, only for cards worth ingesting.
    results.push({ ...card, description: "", sourceName: "linkedin" });
  }
  await page.close();
  return results;
}

async function scrapeIndeed(searchQuery, context) {
  const page = await context.newPage();
  await page.goto(`https://www.indeed.com/jobs?q=${encodeURIComponent(searchQuery)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("#mosaic-provider-jobcards", { timeout: 15000 }).catch(() => {});

  const cards = await page.$$eval("#mosaic-provider-jobcards a[data-jk]", (nodes) =>
    nodes.slice(0, 25).map((n) => ({
      title: n.querySelector(".jobTitle")?.innerText?.trim(),
      company: n.querySelector(".companyName")?.innerText?.trim(),
      location: n.querySelector(".companyLocation")?.innerText?.trim(),
      externalJobId: n.getAttribute("data-jk"),
      sourceUrl: n.href,
    }))
  );

  await page.close();
  return cards
    .filter((c) => c.title && c.sourceUrl)
    .map((c) => ({ ...c, description: "", sourceName: "indeed" }));
}

async function runScrapePass(searchQuery = "software engineer intern") {
  const context = await chromium.launchPersistentContext(
    process.env.PLAYWRIGHT_PROFILE_DIR || "./playwright-profile",
    { headless: process.env.PLAYWRIGHT_HEADLESS !== "false" }
  );

  const [linkedinJobs, indeedJobs] = await Promise.all([
    scrapeLinkedIn(searchQuery, context).catch((e) => {
      console.error("[scraper] LinkedIn pass failed:", e.message);
      return [];
    }),
    scrapeIndeed(searchQuery, context).catch((e) => {
      console.error("[scraper] Indeed pass failed:", e.message);
      return [];
    }),
  ]);

  let ingested = 0;
  for (const job of [...linkedinJobs, ...indeedJobs]) {
    try {
      await ingestJob(job);
      ingested += 1;
    } catch (err) {
      console.error(`[scraper] ingest failed for "${job.title}":`, err.message);
    }
  }

  await context.close();
  console.log(`[scraper] pass complete — ${ingested}/${linkedinJobs.length + indeedJobs.length} ingested`);
  return ingested;
}

if (require.main === module) {
  require("dotenv").config();
  runScrapePass(process.argv[2]).then(() => process.exit(0));
}

module.exports = { runScrapePass, scrapeLinkedIn, scrapeIndeed };
