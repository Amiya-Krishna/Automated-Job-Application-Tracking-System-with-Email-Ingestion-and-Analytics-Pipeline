// One place that decides whether a "job URL" from a client / scraper is safe
// and worth storing. Used by POST/PUT /api/jobs, Gmail import and ingestion so
// every saved job keeps a real, clickable http(s) link - and never a
// javascript:/data: URL, a megabyte of tracking parameters, or a value too
// long for the VARCHAR(1000) column (which used to fail the whole save).

const MAX_URL_LENGTH = 1000;

// Query parameters that only identify a campaign/session, never a posting.
const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "gclid", "fbclid", "msclkid", "mc_cid", "mc_eid", "refid", "trk", "trackingid",
  "trkinfo", "lipi", "licu", "eboto", "campaignid", "recommendedflavor", "refindeedhead",
]);

// Parameters that ARE the posting identity on specific sites - always kept.
const KEEP_PARAMS = {
  "indeed.com": ["jk"],
  "linkedin.com": [],
  "naukri.com": [],
  "wellfound.com": [],
  "unstop.com": [],
  "internshala.com": [],
};

function hostKey(host) {
  const h = host.toLowerCase();
  return Object.keys(KEEP_PARAMS).find((k) => h === k || h.endsWith(`.${k}`)) || null;
}

/**
 * Returns a cleaned absolute http(s) URL string, or null if the input is
 * empty / not a valid web URL. Never throws.
 */
function normalizeJobUrl(input) {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw || raw.length > 4000) return null;

  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname || !u.hostname.includes(".")) return null;
  if (u.username || u.password) return null; // never persist credentials in a URL

  u.hash = "";
  const key = hostKey(u.hostname);
  const keep = new Set(key ? KEEP_PARAMS[key] : []);
  for (const name of [...u.searchParams.keys()]) {
    if (keep.has(name)) continue;
    if (TRACKING_PARAMS.has(name.toLowerCase()) || name.toLowerCase().startsWith("utm_")) u.searchParams.delete(name);
  }

  let out = u.toString();
  if (out.length > MAX_URL_LENGTH) {
    u.search = ""; // an over-long query is almost always tracking noise
    out = u.toString();
  }
  if (out.length > MAX_URL_LENGTH) return null;
  return out;
}

/** True if `value` is a usable external job link (what the UI may render as an <a href>). */
function isLinkableUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value) && !value.startsWith("internal://");
}

module.exports = { normalizeJobUrl, isLinkableUrl, MAX_URL_LENGTH };
