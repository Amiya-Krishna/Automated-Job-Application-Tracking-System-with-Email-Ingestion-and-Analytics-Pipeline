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
  // server-side HTML instead of the SPA shell.
  await page.goto(
    `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(searchQuery)}&start=0`,
    { waitUntil: "domcontentloaded" }
  );

  // Card-level wrapper classes on this endpoint drift a lot (li.base-card,
  // li.base-search-card, or sometimes no class on the <li> at all — only
  // the inner <div> carries "base-card"). Waiting on that wrapper is what
  // used to make this silently return 0 even when the fragment clearly has
  // job data in it. The title/link elements are far more stable, so wait
  // on those instead and walk up to find each card's container.
  const foundCards = await page
    .waitForSelector("h3.base-search-card__title, a.base-card__full-link", { timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  if (!foundCards) {
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || "");
    const isCheckpoint = /sign in|join now|authwall|security verification/i.test(bodyText);
    console.warn(
      `[scraper] LinkedIn returned no job cards — ${
        isCheckpoint
          ? "looks like a login/checkpoint wall, not a markup change"
          : "likely rate-limited, a captcha, or the guest endpoint's markup changed again"
      }. Page text preview: ${JSON.stringify(bodyText)}`
    );
    await page.close();
    return [];
  }

  const cards = await page.$$eval("h3.base-search-card__title, a.base-card__full-link", (nodes) => {
    // Multiple anchors/titles can belong to the same card, so dedupe by
    // walking each match up to its nearest <li> (falling back a few
    // parentElement hops if the <li> wrapper is missing) and keying by
    // that container.
    const seen = new Set();
    const results = [];

    for (const node of nodes) {
      let container = node.closest("li") || node.parentElement?.parentElement || node.parentElement;
      if (!container || seen.has(container)) continue;
      seen.add(container);

      const link = container.querySelector("a.base-card__full-link");
      const title =
        container.querySelector(".base-search-card__title")?.innerText?.trim() ||
        (link?.getAttribute("aria-label") || "").trim();

      results.push({
        title,
        company: container.querySelector(".base-search-card__subtitle")?.innerText?.trim(),
        location: container.querySelector(".job-search-card__location")?.innerText?.trim(),
        sourceUrl: link?.href?.split("?")[0],
      });
    }

    return results.slice(0, 25);
  });

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
    {
      headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
      // Default Playwright Chromium sends a UA/viewport combo that's easy
      // to fingerprint as automation. This doesn't get past Indeed's
      // Cloudflare challenge (that needs a real browsing session, not just
      // header tweaks), but it does help avoid tripping LinkedIn's softer
      // rate-limiting on the guest endpoint.
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      viewport: { width: 1366, height: 850 },
      locale: "en-US",
    }
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
