// Indeed job discovery adapter for the dashboard-triggered scrape flow.
// Same policy as linkedinJobsAdapter.js: no Playwright/HTML scraping, no
// Cloudflare-challenge workarounds. server/services/scraper.js's Indeed
// path is left unused for the same reason.
//
// Indeed's public Job Search Publisher API stopped accepting new
// publishers years ago; current programmatic access is through Indeed's
// employer/ATS-partner APIs (XML job feeds, Indeed Apply), which require
// an approved partner or employer account, not a general-purpose search
// key. Without that, there is no compliant way to pull search results, so
// this adapter reports "unavailable" rather than scraping indeed.com.

const AVAILABLE = Boolean(process.env.INDEED_PARTNER_FEED_URL);

async function discover({ query, location, limit }) {
  if (!AVAILABLE) {
    return {
      source: "indeed",
      status: "unavailable",
      message:
        "Indeed's public search API has been closed to new publishers; " +
        "programmatic access now requires an approved Indeed partner/XML " +
        "job feed, which this app doesn't have configured. Set " +
        "INDEED_PARTNER_FEED_URL if you obtain one; until then, use the " +
        "browser extension's \"Save to TrackTrail\" button while browsing " +
        "Indeed to bring individual listings in compliantly.",
      jobs: [],
    };
  }

  // Placeholder for a real partner XML feed fetch + parse. Not implemented
  // because there is no feed URL to build/test it against.
  try {
    throw new Error(
      "INDEED_PARTNER_FEED_URL is set, but no feed parser is implemented " +
        "yet. Add the real fetch + XML parse here.",
    );
  } catch (err) {
    return { source: "indeed", status: "error", message: err.message, jobs: [] };
  }
}

module.exports = { name: "indeed", discover, AVAILABLE };
