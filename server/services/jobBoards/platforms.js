// Registry of the job boards used by web job discovery. Parsing lives in
// platformExtractors.js (shared with the browser extension); this file only knows
// how to build a search URL and what to wait for. Adding a board = one entry here
// + one entry in platformExtractors.js + a seed row in services/seedSources.js.
const slug = (s) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const enc = encodeURIComponent;

const SEARCH = {
  // https://www.naukri.com/python-developer-jobs-in-pune
  naukri: ({ query, location }) =>
    `https://www.naukri.com/${slug(query)}-jobs${location ? `-in-${slug(location)}` : ""}`,
  // Internshala has separate internship and job listings; the query is a keyword slug.
  internshala: ({ query, location }) =>
    `https://internshala.com/internships/keywords-${slug(query)}${location ? `/in-${slug(location)}` : ""}`,
  // Wellfound's public role pages: /role/l/<role>/<location>
  wellfound: ({ query, location }) =>
    `https://wellfound.com/role/${location ? "l/" : ""}${slug(query)}${location ? `/${slug(location)}` : ""}`,
  unstop: ({ query }) => `https://unstop.com/jobs?searchTerm=${enc(query)}`,
};

// Extra listing pages to try for the same query, after the first.
const SEARCH_EXTRA = {
  internshala: ({ query, location }) => [`https://internshala.com/jobs/keywords-${slug(query)}${location ? `/in-${slug(location)}` : ""}`],
  unstop: ({ query }) => [`https://unstop.com/internships?searchTerm=${enc(query)}`],
};

const PLATFORMS = {
  naukri: { label: "Naukri", wait: 'a[href*="/job-listings-"]' },
  internshala: { label: "Internshala", wait: 'a[href*="/detail/"]' },
  wellfound: { label: "Wellfound", wait: 'a[href*="/jobs/"]' },
  unstop: { label: "Unstop", wait: 'a[href*="/jobs/"], a[href*="/internships/"]' },
};

function searchUrls(name, args) {
  return [SEARCH[name](args), ...((SEARCH_EXTRA[name] && SEARCH_EXTRA[name](args)) || [])];
}

module.exports = { PLATFORMS, searchUrls, slug };
