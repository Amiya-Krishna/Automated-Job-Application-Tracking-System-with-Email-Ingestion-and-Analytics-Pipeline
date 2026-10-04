// Shared Playwright flow for the platform-extractor based boards (Naukri,
// Internshala, Wellfound, Unstop):
//   1. open the search page(s) and wait for posting links,
//   2. run the shared list extractor in the page,
//   3. optionally open each posting (bounded) to fill description / salary / skills.
// Every step degrades gracefully: a blocked page returns a clear "blocked" error for
// that board only, and a failed posting keeps the list-level data.
const fs = require("fs");
const path = require("path");
const { PLATFORMS, searchUrls } = require("./platforms");

const EXTRACTOR_SOURCE = fs.readFileSync(path.join(__dirname, "platformExtractors.js"), "utf8");
const DETAIL_LIMIT = () => Math.max(0, Number(process.env.SCRAPE_DETAIL_LIMIT ?? 15));
const BLOCK_RE = /access denied|captcha|verify you are (?:a )?human|unusual traffic|are you a robot|just a moment|attention required|pardon our interruption|security check|datadome|akamai/i;

class BlockedError extends Error {}

async function loadExtractors(page) {
  // CDP evaluate of a string is not subject to the site's CSP (unlike a <script> tag)
  await page.evaluate(EXTRACTOR_SOURCE);
}

async function assertNotBlocked(page, label) {
  const text = await page.evaluate(() => (document.body && document.body.innerText ? document.body.innerText.slice(0, 600) : "")).catch(() => "");
  if (BLOCK_RE.test(text) || BLOCK_RE.test(await page.title().catch(() => ""))) {
    throw new BlockedError(`${label} showed a bot-check / access wall, so no jobs could be read.`);
  }
}

function mergeDetail(card, d) {
  if (!d) return card;
  return {
    ...card,
    title: card.title || d.role,
    company: card.company || d.company,
    location: card.location || d.location,
    description: d.descriptionStructured || d.description || card.description || "",
    salaryText: card.salaryText || d.salaryText || null,
    skills: (card.skills && card.skills.length ? card.skills : d.skills) || [],
    postedAt: d.postedAt || undefined,
  };
}

function makeScraper(name) {
  const { label, wait } = PLATFORMS[name];

  return async function scrape(query, context, { location, limit }) {
    const page = await context.newPage();
    const jobs = [];
    const seen = new Set();
    try {
      for (const url of searchUrls(name, { query, location })) {
        if (jobs.length >= limit) break;
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
          await assertNotBlocked(page, label);
          await page.waitForSelector(wait, { timeout: 15000 }).catch(() => {});
          await loadExtractors(page);
          const cards = await page.evaluate(
            ([key, opts]) => TrackTrailPlatforms.extractList(key, document, location, opts),
            [name, { limit }],
          );
          for (const c of cards) {
            if (jobs.length >= limit) break;
            const k = c.externalJobId || c.sourceUrl;
            if (seen.has(k)) continue;
            seen.add(k);
            jobs.push(c);
          }
        } catch (err) {
          if (err instanceof BlockedError && !jobs.length) throw err;
          console.warn(`[scraper] ${label} listing ${url} failed: ${err.message}`);
        }
      }
      if (!jobs.length) {
        console.warn(`[scraper] ${label} returned no postings - blocked, empty search, or the page layout changed.`);
        return [];
      }

      // bounded, sequential detail pass (politeness + keeps runs short)
      const detailMax = Math.min(DETAIL_LIMIT(), jobs.length);
      for (let i = 0; i < detailMax; i += 1) {
        try {
          await page.goto(jobs[i].sourceUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
          await assertNotBlocked(page, label);
          await loadExtractors(page);
          const detail = await page.evaluate((key) => TrackTrailPlatforms.extractDetail(key, document, location), name);
          jobs[i] = mergeDetail(jobs[i], detail);
        } catch (err) {
          if (err instanceof BlockedError) break; // stop hammering a site that is blocking us
          console.warn(`[scraper] ${label} detail ${jobs[i].sourceUrl} failed: ${err.message}`);
        }
      }
      return jobs;
    } finally {
      await page.close().catch(() => {});
    }
  };
}

module.exports = { makeScraper, BlockedError, mergeDetail };
