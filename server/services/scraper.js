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

  // The old code hit https://www.linkedin.com/jobs/search/?... — that's the
  // authenticated search UI, and without a logged-in session it redirects
  // to the /authwall login page, so `.jobs-search__results-list` never
  // appears and every pass silently returned 0 results.
  //
  // LinkedIn separately serves search results to signed-out visitors (and
  // search engines) through its "guest" endpoint, which renders plain
  // server-side HTML instead of the SPA shell. That's what the selectors
  // below (base-search-card__*, base-card__full-link) actually match.
  await page.goto(
    `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(searchQuery)}&start=0`,
    { waitUntil: "domcontentloaded" }
  );

  const foundCards = await page
    .waitForSelector("li.base-search-card, li.base-card", { timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  if (!foundCards) {
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || "");
    console.warn(
      "[scraper] LinkedIn returned no job cards — likely rate-limited, showing a " +
        "captcha/checkpoint, or the guest endpoint's markup changed again. " +
        `Page text preview: ${JSON.stringify(bodyText)}`
    );
    await page.close();
    return [];
  }

  const cards = await page.$$eval("li.base-search-card, li.base-card", (nodes) =>
    nodes.slice(0, 25).map((n) => ({
      title: n.querySelector(".base-search-card__title")?.innerText?.trim(),
      company: n.querySelector(".base-search-card__subtitle")?.innerText?.trim(),
      location: n.querySelector(".job-search-card__location")?.innerText?.trim(),
      sourceUrl: n.querySelector("a.base-card__full-link")?.href?.split("?")[0],
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

  // Indeed retired the old #mosaic-provider-jobcards a[data-jk] markup —
  // job cards now render as div.job_seen_beacon inside a
  // [data-testid="jobsearch-ResultsList"] container, with data-testid
  // attributes on the title/company/location instead of stable classnames.
  const foundCards = await page
    .waitForSelector("div.job_seen_beacon", { timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  if (!foundCards) {
    // Indeed sits behind Cloudflare and will often show an interstitial
    // ("Additional Verification Required" / a JS challenge page) to
    // automated browsers instead of a 4xx, so a plain try/catch around
    // goto() won't surface the real reason for 0 results. Log a preview
    // so this is diagnosable instead of silently returning nothing.
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || "");
    console.warn(
      "[scraper] Indeed returned no job cards — likely a bot-detection " +
        `interstitial or a markup change. Page text preview: ${JSON.stringify(bodyText)}`
    );
    await page.close();
    return [];
  }

  const cards = await page.$$eval("div.job_seen_beacon", (nodes) =>
    nodes.slice(0, 25).map((n) => {
      const link = n.querySelector("a.jcs-JobTitle, h2.jobTitle a");
      return {
        title:
          n.querySelector("h2.jobTitle span[title]")?.getAttribute("title")?.trim() ||
          n.querySelector("h2.jobTitle")?.innerText?.trim(),
        company: n.querySelector('[data-testid="company-name"]')?.innerText?.trim(),
        location: n.querySelector('[data-testid="text-location"]')?.innerText?.trim(),
        externalJobId: link?.getAttribute("data-jk") || n.getAttribute("data-jk"),
        sourceUrl: link?.href,
      };
    })
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
