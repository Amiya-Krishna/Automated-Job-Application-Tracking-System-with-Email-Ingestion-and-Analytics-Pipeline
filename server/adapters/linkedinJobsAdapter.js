// LinkedIn job discovery adapter for the dashboard-triggered scrape flow
// (server/services/jobDiscovery). This is intentionally NOT the Playwright
// browser-automation approach in server/services/scraper.js — that file
// scrapes LinkedIn's "guest" HTML endpoint with a spoofed desktop
// user-agent specifically to stay under LinkedIn's automated-access
// detection, which is exactly the kind of anti-bot bypass this adapter
// layer must not do. It is left in the repo unused (see the audit note in
// docs/PROJECT_STRUCTURE.md-adjacent summary) rather than wired to the
// dashboard button.
//
// LinkedIn does not offer a public, self-serve job-search API. Programmatic
// access to job listings is only available through LinkedIn Talent
// Solutions partnerships, which require a signed agreement and approval —
// not just an API key you can drop in an .env file. Until this app is
// registered as such a partner, this adapter has no compliant way to
// return real listings, so it reports that honestly instead of silently
// returning zero results or, worse, scraping anyway.
//
// If/when real partner credentials exist, wire the fetch call in here and
// flip AVAILABLE to true — the rest of the pipeline (dedup, ingestion,
// matching) already works and needs no changes.

const AVAILABLE = Boolean(process.env.LINKEDIN_TALENT_API_TOKEN);

async function discover({ query, location, limit }) {
  if (!AVAILABLE) {
    return {
      source: "linkedin",
      status: "unavailable",
      message:
        "LinkedIn job search requires a LinkedIn Talent Solutions partner " +
        "API agreement — there is no public API and this app is not a " +
        "registered partner. Set LINKEDIN_TALENT_API_TOKEN once you have " +
        "one; until then, use the browser extension's \"Save to TrackTrail\" " +
        "button while browsing LinkedIn to bring individual listings in " +
        "compliantly.",
      jobs: [],
    };
  }

  // Placeholder for a real Talent Solutions API call. Not implemented
  // because there is no credential to build/test it against — returning
  // a fabricated response here would violate "don't fake ingestion."
  try {
    throw new Error(
      "LINKEDIN_TALENT_API_TOKEN is set, but no Talent Solutions API " +
        "client is implemented yet. Add the real API call here.",
    );
  } catch (err) {
    return { source: "linkedin", status: "error", message: err.message, jobs: [] };
  }
}

module.exports = { name: "linkedin", discover, AVAILABLE };
