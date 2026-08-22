// Runs on LinkedIn job pages and Indeed job pages. Tries a handful of
// selectors (sites restyle their DOM often, so these are best-effort with
// fallbacks to <title>/meta tags), then injects a floating "Save to
// TrackTrail" button that posts the detected job straight to the backend
// via the background service worker.
//
// Captures everything legitimately visible on the page — title, company,
// location, description, a canonical source URL, and (where present) the
// site's own job id — so the saved job carries enough metadata to be
// bridged into the matching engine server-side (see engineBridge.js /
// hasEnoughDataToBridge()). Nothing here is invented: any field that
// can't be found on the page is sent as null/empty and the backend
// decides whether that's "enough".

function text(el) {
  return el ? el.textContent.trim().replace(/\s+/g, " ") : "";
}

function firstMatch(selectors) {
  for (const sel of selectors) {
    const found = text(document.querySelector(sel));
    if (found) return found;
  }
  return "";
}

// LinkedIn job ids live in the URL as ?currentJobId=NNNN or /jobs/view/NNNN
function extractLinkedInJobId(url) {
  try {
    const u = new URL(url);
    const fromQuery = u.searchParams.get("currentJobId");
    if (fromQuery) return fromQuery;
    const viewMatch = u.pathname.match(/\/jobs\/view\/(\d+)/);
    if (viewMatch) return viewMatch[1];
  } catch {
    // ignore malformed URL
  }
  return "";
}

// Indeed job ids live in the URL as ?jk=xxxxxxxxxxxxxxxx
function extractIndeedJobId(url) {
  try {
    const u = new URL(url);
    return u.searchParams.get("jk") || "";
  } catch {
    return "";
  }
}

// Builds a canonical, shareable job URL rather than always using
// window.location.href verbatim — LinkedIn/Indeed URLs carry a lot of
// session/tracking query params that make otherwise-identical postings
// look like different URLs to the backend's dedup logic.
function canonicalLinkedInUrl(jobId) {
  return jobId
    ? `https://www.linkedin.com/jobs/view/${jobId}/`
    : window.location.href.split("?")[0];
}

function canonicalIndeedUrl(jobId) {
  return jobId
    ? `https://www.indeed.com/viewjob?jk=${jobId}`
    : window.location.href.split("?")[0];
}

function detectLinkedIn() {
  const titleSelectors = [
    "h1.job-details-jobs-unified-top-card__job-title",
    "h1.top-card-layout__title",
    '[role="heading"][aria-level="1"]',
    "h1",
  ];
  const companySelectors = [
    ".job-details-jobs-unified-top-card__company-name a",
    ".job-details-jobs-unified-top-card__company-name",
    ".top-card-layout__second-subline a",
  ];
  const locationSelectors = [
    ".job-details-jobs-unified-top-card__primary-description-container .tvm__text",
    ".job-details-jobs-unified-top-card__bullet",
    ".top-card-layout__second-subline .topcard__flavor--bullet",
  ];
  const descriptionSelectors = [
    "#job-details",
    ".jobs-description__content",
    ".jobs-box__html-content",
    ".description__text",
  ];

  let role = firstMatch(titleSelectors);
  let company = firstMatch(companySelectors);
  const location = firstMatch(locationSelectors);
  const description = firstMatch(descriptionSelectors);

  // DOM selectors above rely on LinkedIn's CSS classnames, which are
  // increasingly hashed/randomized (e.g. "bed7a945") and change often.
  // document.title is far more stable and LinkedIn keeps it in one of
  // two formats depending on the listing:
  //   "(N) Company hiring Role in Location | LinkedIn"   (older format)
  //   "Role | Company | LinkedIn"                         (current format)
  if (!role || !company) {
    const title = document.title.replace(/^\(\d+\)\s*/, "");

    const hiringMatch = title.match(/^(.+?)\s+hiring\s+(.+?)\s+in\s+/i);
    if (hiringMatch) {
      if (!company) company = hiringMatch[1].trim();
      if (!role) role = hiringMatch[2].trim();
    } else {
      const parts = title.split("|").map((p) => p.trim()).filter(Boolean);
      // parts look like ["Role", "Company", "LinkedIn"] — drop the
      // trailing "LinkedIn" and use what's left.
      const withoutSiteName = parts.filter((p) => p.toLowerCase() !== "linkedin");
      if (!role && withoutSiteName[0]) role = withoutSiteName[0];
      if (!company && withoutSiteName[1]) company = withoutSiteName[1];
    }

    const ogSiteName = document.querySelector('meta[property="og:title"]');
    if (ogSiteName && !role) role = ogSiteName.content;
  }

  const externalJobId = extractLinkedInJobId(window.location.href);

  return {
    role,
    company,
    location,
    description,
    externalJobId,
    sourceUrl: canonicalLinkedInUrl(externalJobId),
    sourceName: "linkedin",
  };
}

function detectIndeed() {
  const titleSelectors = [
    '[data-testid="jobsearch-JobInfoHeader-title"]',
    "h1.jobsearch-JobInfoHeader-title",
    "h1",
  ];
  const companySelectors = [
    '[data-testid="inlineHeader-companyName"]',
    ".jobsearch-InlineCompanyRating div",
  ];
  const locationSelectors = [
    '[data-testid="inlineHeader-companyLocation"]',
    ".jobsearch-JobInfoHeader-subtitle .jobsearch-JobInfoHeader-locationText",
  ];
  const descriptionSelectors = ["#jobDescriptionText"];

  let role = firstMatch(titleSelectors);
  let company = firstMatch(companySelectors);
  const location = firstMatch(locationSelectors);
  const description = firstMatch(descriptionSelectors);

  if (!role || !company) {
    // Fallback: Indeed <title> is usually "Role - Company - Location"
    const parts = document.title.split(" - ");
    if (parts.length >= 2) {
      if (!role) role = parts[0].trim();
      if (!company) company = parts[1].trim();
    }
  }

  const externalJobId = extractIndeedJobId(window.location.href);

  return {
    role,
    company,
    location,
    description,
    externalJobId,
    sourceUrl: canonicalIndeedUrl(externalJobId),
    sourceName: "indeed",
  };
}

function detectJob() {
  if (window.location.hostname.includes("linkedin.com")) return detectLinkedIn();
  if (window.location.hostname.includes("indeed.com")) return detectIndeed();
  // Generic fallback for any other host the manifest might someday allow —
  // never invent a source, just report what's genuinely on the page.
  return {
    role: "",
    company: "",
    location: "",
    description: "",
    externalJobId: "",
    sourceUrl: window.location.href,
    sourceName: "extension",
  };
}

function injectButton() {
  if (document.getElementById("tracktrail-save-btn")) return;

  const detected = detectJob();
  if (!detected.company && !detected.role) return;

  const button = document.createElement("button");
  button.id = "tracktrail-save-btn";
  button.className = "tracktrail-fab";
  button.textContent = "+ Save to TrackTrail";
  document.body.appendChild(button);

  // Match the extension's own light/dark preference (set in the popup/
  // dashboard, persisted to chrome.storage.local) — not the host page's
  // theme, which this button intentionally ignores for contrast reasons
  // (see content.css).
  chrome.storage?.local?.get(["tracktrail_theme"], (result) => {
    if (result.tracktrail_theme === "dark") {
      button.classList.add("tracktrail-fab--dark");
    }
  });

  button.addEventListener("click", async () => {
    if (!chrome.runtime?.id) {
      button.textContent = "Reload this page";
      return;
    }

    // Re-detect at click time (not at inject time) — SPA nav on these
    // sites can change the visible posting without a full page reload.
    const live = detectJob();

    button.disabled = true;
    button.textContent = "Saving...";

    chrome.runtime.sendMessage(
      {
        type: "SAVE_JOB",
        job: {
          company: live.company || "Unknown company",
          role: live.role || "Unknown role",
          status: "Applied",
          notes: `Saved from ${window.location.hostname}`,
          // Full capture for the engine bridge — never fabricated, only
          // what was actually found on the page (empty string/undefined
          // where nothing was detected).
          location: live.location || null,
          description: live.description || null,
          sourceName: live.sourceName,
          sourceUrl: live.sourceUrl,
          externalJobId: live.externalJobId || null,
        },
      },
      (response) => {
        button.disabled = false;

        if (response?.ok) {
          button.textContent = response.duplicate ? "Already saved" : "✓ Saved";
          button.classList.add("tracktrail-fab--success");
          setTimeout(() => {
            button.textContent = "+ Save to TrackTrail";
            button.classList.remove("tracktrail-fab--success");
          }, 2500);
        } else {
          button.textContent = response?.error?.includes("logged in")
            ? "Log in via extension icon"
            : "Failed — try again";
          button.classList.add("tracktrail-fab--error");
          setTimeout(() => {
            button.textContent = "+ Save to TrackTrail";
            button.classList.remove("tracktrail-fab--error");
          }, 2500);
        }
      }
    );
  });
}

// Job sites are single-page apps — the URL changes without a full reload,
// so re-check periodically for a new posting being viewed. If the URL
// changes, remove the old button so injectButton() re-evaluates against
// the newly-visible job instead of leaving a stale one in place.
let lastHref = window.location.href;
const pollId = setInterval(() => {
  if (!chrome.runtime?.id) {
    clearInterval(pollId);
    return;
  }
  if (window.location.href !== lastHref) {
    lastHref = window.location.href;
    document.getElementById("tracktrail-save-btn")?.remove();
  }
  injectButton();
}, 1500);

injectButton();
