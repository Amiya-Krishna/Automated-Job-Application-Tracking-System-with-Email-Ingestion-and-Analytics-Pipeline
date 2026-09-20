// Job-page extraction for the TrackTrail extension. Classic (non-module)
// content script, loaded BEFORE content.js. It only READS what is visibly on
// the page and normalises it; it contains no tailoring/AI logic. Nothing is
// invented: a field that can't be found is returned as an empty string.
//
// It is written to run against an explicit `doc`/`loc` so the same code is
// unit-tested in jsdom (see tests/extract.test.js).
(function (root) {
  "use strict";

  const MAX_DESCRIPTION_CHARS = 30000; // server also caps; keeps requests small

  function text(el) {
    return el ? el.textContent.trim().replace(/\s+/g, " ") : "";
  }

  function firstMatch(doc, selectors) {
    for (const sel of selectors) {
      const found = text(doc.querySelector(sel));
      if (found) return found;
    }
    return "";
  }

  function firstElement(doc, selectors) {
    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      if (el && text(el)) return el;
    }
    return null;
  }

  const BLOCK = new Set(["P", "DIV", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "TR", "SECTION", "ARTICLE", "HEADER", "FOOTER", "BLOCKQUOTE", "TABLE"]);
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "BUTTON"]);

  /**
   * Text of `el` WITH its line structure (headings, paragraphs, bullets), which
   * `textContent` + whitespace-collapsing destroys. The backend uses headings
   * like "Requirements" / "Preferred qualifications" to tell required skills
   * from nice-to-haves, so structure matters. (innerText isn't available
   * without layout, e.g. in tests, so the DOM is walked explicitly.)
   */
  function structuredText(el, view) {
    if (!el) return "";
    const out = [];
    const walk = (node) => {
      if (node.nodeType === 3) { out.push(node.nodeValue.replace(/\s+/g, " ")); return; }
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toUpperCase();
      if (SKIP.has(tag)) return;
      try {
        if (view && view.getComputedStyle(node).display === "none") return; // hidden text is not "visible JD"
      } catch (e) { /* ignore */ }
      if (tag === "BR") { out.push("\n"); return; }
      if (tag === "LI") out.push("\n- ");
      else if (BLOCK.has(tag)) out.push("\n");
      node.childNodes.forEach(walk);
      if (tag === "LI" || BLOCK.has(tag)) out.push("\n");
    };
    walk(el);
    return out.join("").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  // LinkedIn job ids live in the URL as ?currentJobId=NNNN or /jobs/view/NNNN
  function extractLinkedInJobId(url) {
    try {
      const u = new URL(url);
      const fromQuery = u.searchParams.get("currentJobId");
      if (fromQuery) return fromQuery;
      const viewMatch = u.pathname.match(/\/jobs\/view\/(\d+)/);
      if (viewMatch) return viewMatch[1];
    } catch (e) { /* ignore malformed URL */ }
    return "";
  }

  // Indeed job ids live in the URL as ?jk=xxxxxxxxxxxxxxxx
  function extractIndeedJobId(url) {
    try { return new URL(url).searchParams.get("jk") || ""; } catch (e) { return ""; }
  }

  // Canonical URLs: LinkedIn/Indeed URLs carry session/tracking params that
  // make identical postings look different to the backend's dedup logic.
  const canonicalLinkedInUrl = (jobId, href) => (jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : href.split("?")[0]);
  const canonicalIndeedUrl = (jobId, href) => (jobId ? `https://www.indeed.com/viewjob?jk=${jobId}` : href.split("?")[0]);

  const LI = {
    title: ["h1.job-details-jobs-unified-top-card__job-title", "h1.top-card-layout__title", '[role="heading"][aria-level="1"]', "h1"],
    company: [".job-details-jobs-unified-top-card__company-name a", ".job-details-jobs-unified-top-card__company-name", ".top-card-layout__second-subline a"],
    location: [".job-details-jobs-unified-top-card__primary-description-container .tvm__text", ".job-details-jobs-unified-top-card__bullet", ".top-card-layout__second-subline .topcard__flavor--bullet"],
    description: ["#job-details", ".jobs-description__content", ".jobs-box__html-content", ".description__text"],
  };
  const IN = {
    title: ['[data-testid="jobsearch-JobInfoHeader-title"]', "h1.jobsearch-JobInfoHeader-title", "h1"],
    company: ['[data-testid="inlineHeader-companyName"]', ".jobsearch-InlineCompanyRating div"],
    location: ['[data-testid="inlineHeader-companyLocation"]', ".jobsearch-JobInfoHeader-subtitle .jobsearch-JobInfoHeader-locationText"],
    description: ["#jobDescriptionText"],
  };

  function describe(doc, sel) {
    const el = firstElement(doc, sel.description);
    return {
      description: text(el),
      // same element, line structure kept — this is what tailoring analyses
      descriptionStructured: structuredText(el, doc.defaultView).slice(0, MAX_DESCRIPTION_CHARS),
    };
  }

  function detectLinkedIn(doc, loc) {
    let role = firstMatch(doc, LI.title);
    let company = firstMatch(doc, LI.company);
    const location = firstMatch(doc, LI.location);
    const desc = describe(doc, LI);

    // LinkedIn's CSS classes are hashed and change often; document.title is
    // more stable. Two formats:
    //   "(N) Company hiring Role in Location | LinkedIn"   (older)
    //   "Role | Company | LinkedIn"                         (current)
    if (!role || !company) {
      const title = doc.title.replace(/^\(\d+\)\s*/, "");
      const hiring = title.match(/^(.+?)\s+hiring\s+(.+?)\s+in\s+/i);
      if (hiring) {
        if (!company) company = hiring[1].trim();
        if (!role) role = hiring[2].trim();
      } else {
        const parts = title.split("|").map((p) => p.trim()).filter(Boolean).filter((p) => p.toLowerCase() !== "linkedin");
        if (!role && parts[0]) role = parts[0];
        if (!company && parts[1]) company = parts[1];
      }
      const og = doc.querySelector('meta[property="og:title"]');
      if (og && !role) role = og.content;
    }
    const externalJobId = extractLinkedInJobId(loc.href);
    return { role, company, location, ...desc, externalJobId, sourceUrl: canonicalLinkedInUrl(externalJobId, loc.href), sourceName: "linkedin" };
  }

  function detectIndeed(doc, loc) {
    let role = firstMatch(doc, IN.title);
    let company = firstMatch(doc, IN.company);
    const location = firstMatch(doc, IN.location);
    const desc = describe(doc, IN);
    if (!role || !company) {
      // Indeed <title> is usually "Role - Company - Location"
      const parts = doc.title.split(" - ");
      if (parts.length >= 2) {
        if (!role) role = parts[0].trim();
        if (!company) company = parts[1].trim();
      }
    }
    const externalJobId = extractIndeedJobId(loc.href);
    return { role, company, location, ...desc, externalJobId, sourceUrl: canonicalIndeedUrl(externalJobId, loc.href), sourceName: "indeed" };
  }

  function detectJob(doc, loc) {
    doc = doc || root.document;
    loc = loc || root.location;
    if (loc.hostname.includes("linkedin.com")) return detectLinkedIn(doc, loc);
    if (loc.hostname.includes("indeed.com")) return detectIndeed(doc, loc);
    // never invent a source: report only what is genuinely on the page
    return { role: "", company: "", location: "", description: "", descriptionStructured: "", externalJobId: "", sourceUrl: loc.href, sourceName: "extension" };
  }

  /**
   * Normalise a detection into the `job` object the Resume Tailoring API
   * expects. Empty fields stay empty/null — they are never filled in.
   */
  function toApiJob(d) {
    return {
      title: d.role || "",
      company: d.company || "",
      location: d.location || null,
      description: d.descriptionStructured || d.description || "",
      sourceUrl: d.sourceUrl || null,
      sourceName: d.sourceName || "extension",
      externalJobId: d.externalJobId || null,
    };
  }

  /** The exact payload the original "Save to TrackTrail" button always sent. */
  function toSaveJob(d, hostname) {
    return {
      company: d.company || "Unknown company",
      role: d.role || "Unknown role",
      status: "Applied",
      notes: `Saved from ${hostname}`,
      // Full capture for the engine bridge — never fabricated, only what was
      // actually found on the page.
      location: d.location || null,
      description: d.description || null,
      sourceName: d.sourceName,
      sourceUrl: d.sourceUrl,
      externalJobId: d.externalJobId || null,
    };
  }

  const api = { toSaveJob, text, firstMatch, structuredText, extractLinkedInJobId, extractIndeedJobId, detectLinkedIn, detectIndeed, detectJob, toApiJob };
  root.TrackTrailExtract = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
