// Platform extractors for the job boards TrackTrail understands:
// LinkedIn and Indeed (detail pages, see jd-extract.js) plus Naukri,
// Internshala, Wellfound and Unstop (this file).
//
// SINGLE SOURCE OF TRUTH. The browser extension loads this file as a content
// script, and the server reuses the very same code for web job discovery
// (server/services/jobBoards/platformExtractors.js is a verbatim copy; run
// `npm run sync:extractors` in server/ after editing, a test fails on drift).
//
// Design rules
//  - Read-only: only what is visibly on the page is returned. Nothing is
//    invented; a field that cannot be found is "" / [] and the caller decides.
//  - Three layers per field, most reliable first: the platform's own
//    selectors (matched on stable fragments such as [class*="jd-header-title"]
//    because these sites ship hashed class names), schema.org JobPosting
//    JSON-LD, then <title>/og: meta. A layer that throws or finds nothing
//    simply falls through - one broken selector never breaks a save.
//  - Runs against an explicit `doc`/`loc`, so it is unit-tested in jsdom
//    with fixtures (browser-extension/tests/platforms.test.js).
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TrackTrailPlatforms = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_DESCRIPTION_CHARS = 30000;
  const MAX_SKILLS = 30;

  // ------------------------------------------------------------ text helpers
  const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const text = (el) => (el ? clean(el.textContent) : "");

  function firstText(root, selectors) {
    for (const sel of selectors) {
      try {
        const t = text(root.querySelector(sel));
        if (t) return t;
      } catch (e) { /* invalid selector for this engine: try the next one */ }
    }
    return "";
  }

  function firstEl(root, selectors) {
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel);
        if (el && text(el)) return el;
      } catch (e) { /* ignore */ }
    }
    return null;
  }

  function allTexts(root, selectors, { max = MAX_SKILLS, maxLen = 60 } = {}) {
    const out = [];
    const seen = new Set();
    for (const sel of selectors) {
      let nodes = [];
      try { nodes = root.querySelectorAll(sel); } catch (e) { continue; }
      for (const n of nodes) {
        const t = text(n);
        const k = t.toLowerCase();
        if (!t || t.length > maxLen || seen.has(k)) continue;
        seen.add(k);
        out.push(t);
        if (out.length >= max) return out;
      }
      if (out.length) return out;
    }
    return out;
  }

  const BLOCK = new Set(["P", "DIV", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "TR", "SECTION", "ARTICLE", "HEADER", "FOOTER", "BLOCKQUOTE", "TABLE"]);
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "BUTTON"]);

  // Text with its line structure (headings/paragraphs/bullets) preserved; the
  // backend relies on headings like "Requirements" to separate must-haves.
  function structuredText(el, view) {
    if (!el) return "";
    const out = [];
    const walk = (node) => {
      if (node.nodeType === 3) { out.push(node.nodeValue.replace(/\s+/g, " ")); return; }
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toUpperCase();
      if (SKIP.has(tag)) return;
      try { if (view && view.getComputedStyle(node).display === "none") return; } catch (e) { /* ignore */ }
      if (tag === "BR") { out.push("\n"); return; }
      if (tag === "LI") out.push("\n- ");
      else if (BLOCK.has(tag)) out.push("\n");
      node.childNodes.forEach(walk);
      if (tag === "LI" || BLOCK.has(tag)) out.push("\n");
    };
    walk(el);
    return out.join("").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  // HTML string (from JSON-LD) -> structured plain text, via an inert document
  // (DOMParser never runs scripts or loads resources).
  function htmlToText(html, view) {
    const s = String(html || "");
    if (!s) return "";
    if (!/<[a-z][\s\S]*>/i.test(s)) return s.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
    try {
      const Parser = (view && view.DOMParser) || (typeof DOMParser !== "undefined" ? DOMParser : null);
      if (!Parser) return clean(s.replace(/<[^>]*>/g, " "));
      const d = new Parser().parseFromString(s, "text/html");
      return structuredText(d.body, null);
    } catch (e) {
      return clean(s.replace(/<[^>]*>/g, " "));
    }
  }

  // ------------------------------------------------------------ salary / money
  const MONEY = "(?:₹|rs\\.?|inr|\\$|usd|€|eur|£|gbp|aed)";
  const AMOUNT = "\\d[\\d,]*(?:\\.\\d+)?\\s?(?:k|m|lpa|lacs?|lakhs?|cr|crores?)?";
  const PERIOD = "(?:\\s?(?:\\/|per|a)\\s?(?:hr|hour|month|mo|yr|year|annum|week|day)|\\s?(?:p\\.?a\\.?|pm|p\\.m\\.))";
  const SALARY_WITH_CURRENCY = new RegExp(`${MONEY}\\s?${AMOUNT}(?:\\s?(?:-|–|—|to)\\s?${MONEY}?\\s?${AMOUNT})?(?:${PERIOD})?`, "i");
  const SALARY_LACS = new RegExp("\\d[\\d.,]*\\s?(?:-|–|to)\\s?\\d[\\d.,]*\\s?(?:lacs?|lakhs?|lpa|cr|crores?)(?:\\s?(?:p\\.?a\\.?|per annum))?", "i");

  /** First salary/stipend-looking phrase in `s`, or "" (never guesses). */
  function findSalary(s) {
    const t = clean(s);
    if (!t) return "";
    if (/^unpaid$/i.test(t) || /\bunpaid\b/i.test(t)) return "Unpaid";
    const m = t.match(SALARY_WITH_CURRENCY) || t.match(SALARY_LACS);
    return m ? clean(m[0]).slice(0, 120) : "";
  }

  /** Clean a salary element's text; "Not disclosed" and the like become "". */
  function salaryFromElementText(s) {
    const t = clean(s);
    if (!t || /not\s+disclosed|not\s+mentioned|competitive|negotiable|as per industry/i.test(t)) return "";
    return findSalary(t) || (/\d/.test(t) && t.length <= 80 ? t : "");
  }

  // ------------------------------------------------------------ contact email
  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
  const IGNORED_MAIL = /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|abuse|privacy|unsubscribe|notifications?|support@(linkedin|indeed))|@(example|sentry|email\.|mail\.|.*\.(png|jpg|gif|svg))/i;
  const PREFERRED_MAIL = /^(careers?|jobs?|hr|hiring|recruit(ing|er|ment)?|talent|resume|cv|apply|applications?|people|campus|internships?)/i;

  /** The most plausible recruiter/contact address in a job description, or "". */
  function findContactEmail(s) {
    const found = String(s || "").match(EMAIL_RE) || [];
    const usable = found.filter((e) => !IGNORED_MAIL.test(e) && !/\.(png|jpe?g|gif|svg|webp)$/i.test(e));
    if (!usable.length) return "";
    return usable.find((e) => PREFERRED_MAIL.test(e)) || usable[0];
  }

  // ------------------------------------------------------------ JSON-LD
  function readJsonLd(doc) {
    const out = [];
    let nodes = [];
    try { nodes = doc.querySelectorAll('script[type="application/ld+json"]'); } catch (e) { return out; }
    const push = (v) => {
      if (!v) return;
      if (Array.isArray(v)) return v.forEach(push);
      if (typeof v !== "object") return;
      out.push(v);
      if (v["@graph"]) push(v["@graph"]);
    };
    for (const n of nodes) {
      try { push(JSON.parse(n.textContent)); } catch (e) { /* malformed block: skip */ }
    }
    return out;
  }

  const isJobPosting = (o) => {
    const t = o && o["@type"];
    return Array.isArray(t) ? t.includes("JobPosting") : t === "JobPosting";
  };

  function ldSalary(base) {
    if (!base || typeof base !== "object") return "";
    const v = base.value && typeof base.value === "object" ? base.value : base;
    const cur = base.currency || v.currency || "";
    const unit = v.unitText || base.unitText || "";
    const lo = v.minValue, hi = v.maxValue, one = v.value;
    const num = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-US") : clean(n));
    let amount = "";
    if (lo != null && hi != null && lo !== "" && hi !== "") amount = `${num(lo)} - ${num(hi)}`;
    else if (one != null && one !== "" && typeof one !== "object") amount = num(one);
    else if (lo != null && lo !== "") amount = num(lo);
    if (!amount) return "";
    const per = unit ? ` / ${String(unit).toLowerCase()}` : "";
    return clean(`${cur} ${amount}${per}`);
  }

  function ldLocation(jp) {
    const parts = [];
    const locs = Array.isArray(jp.jobLocation) ? jp.jobLocation : jp.jobLocation ? [jp.jobLocation] : [];
    for (const l of locs) {
      const a = (l && l.address) || {};
      if (typeof a === "string") { parts.push(a); continue; }
      const piece = [a.addressLocality, a.addressRegion, a.addressCountry && (a.addressCountry.name || a.addressCountry)].filter(Boolean).join(", ");
      if (piece) parts.push(piece);
    }
    let out = parts.join(" | ");
    if (!out && /TELECOMMUTE/i.test(String(jp.jobLocationType || ""))) out = "Remote";
    return clean(out);
  }

  function ldSkills(jp) {
    const raw = jp.skills || jp.skill || null;
    let list = [];
    if (Array.isArray(raw)) list = raw.map((s) => (typeof s === "string" ? s : s && s.name)).filter(Boolean);
    else if (typeof raw === "string") list = raw.split(/[,;|\n]/);
    return list.map(clean).filter((s) => s && s.length <= 60).slice(0, MAX_SKILLS);
  }

  /** The page's schema.org JobPosting as normalised fields, or null. */
  function fromJsonLd(doc) {
    const jp = readJsonLd(doc).find(isJobPosting);
    if (!jp) return null;
    const org = jp.hiringOrganization;
    return {
      title: clean(jp.title || jp.name),
      company: clean(typeof org === "string" ? org : org && org.name),
      location: ldLocation(jp),
      descriptionHtml: typeof jp.description === "string" ? jp.description : "",
      salaryText: ldSalary(jp.baseSalary),
      skills: ldSkills(jp),
      employmentType: clean(Array.isArray(jp.employmentType) ? jp.employmentType.join(", ") : jp.employmentType),
      url: typeof jp.url === "string" ? jp.url : "",
      postedAt: clean(jp.datePosted),
    };
  }

  // ------------------------------------------------------------ URL / ids
  function safeUrl(u) { try { return new URL(u); } catch (e) { return null; } }

  /** Absolute, fragment-free http(s) URL or "". */
  function absUrl(href, base) {
    if (!href) return "";
    let u;
    try { u = new URL(href, base || undefined); } catch (e) { return ""; }
    if (!/^https?:$/.test(u.protocol)) return "";
    u.hash = "";
    return u.toString();
  }

  function stripQuery(href) {
    const u = safeUrl(href);
    if (!u) return "";
    u.search = "";
    u.hash = "";
    return u.toString();
  }

  // ------------------------------------------------------------ platform table
  // `detail`   : page selectors, tried in order, most specific first.
  // `idFromUrl`: the platform's own job id, taken from the URL.
  // `isJobUrl` : does this URL look like a single-posting page?
  // `listCard` : container hints for search-result cards (server discovery).
  const PLATFORMS = {
    naukri: {
      label: "Naukri",
      hosts: ["naukri.com"],
      base: "https://www.naukri.com",
      isJobUrl: (u) => /\/job-listings-/i.test(u.pathname),
      idFromUrl: (u) => (u.pathname.match(/(\d{8,})(?:\/)?$/) || [])[1] || "",
      detail: {
        title: ['h1[class*="jd-header-title"]', "h1.jd-header-title", "header h1", "h1"],
        company: ['[class*="jd-header-comp-name"] a', '[class*="jd-header-comp-name"]', 'a[class*="comp-name"]', ".jd-header-comp-name"],
        location: ['[class*="jhc__location"] a', '[class*="location"] a', '[class*="jhc__loc"]', ".location"],
        salary: ['[class*="jhc__salary"]', '[class*="salary"] span', '[class*="salary"]', ".salary"],
        description: ['[class*="JDC__dang-inner-html"]', '[class*="job-desc-container"]', 'section[class*="job-desc"]', ".dang-inner-html", '[class*="job-desc"]'],
        skills: ['[class*="key-skill"] a', '[class*="key-skill"] span', 'a[class*="chip"]', '[class*="chip"] span'],
        titleFromDocTitle: (t) => { const parts = t.replace(/\s*[|\-–]\s*Naukri(?:\.com)?\s*$/i, "").split(/\s+[-–|]\s+/).map((x) => x.trim()).filter(Boolean); return parts.length >= 2 ? { title: parts[0], company: parts[1] } : null; },
      },
      listCard: ["div.srp-jobtuple-wrapper", "div.cust-job-tuple", "article.jobTuple", "div.jobTuple"],
      list: {
        title: ["a.title", 'a[class*="title"]'],
        company: ["a.comp-name", '[class*="comp-name"]'],
        location: ["span.locWraper", ".locWraper .loc", '[class*="loc-wrap"]', ".loc"],
        salary: ["span.sal-wrap", ".sal", '[class*="sal-wrap"]'],
        skills: ["ul.tags-gt li", ".tags-gt li", '[class*="tag-li"]'],
        description: [".job-desc", '[class*="job-desc"]'],
      },
    },
    internshala: {
      label: "Internshala",
      hosts: ["internshala.com"],
      base: "https://internshala.com",
      isJobUrl: (u) => /\/(internship|job)\/detail\//i.test(u.pathname),
      idFromUrl: (u) => (u.pathname.match(/(\d{6,})\/?$/) || [])[1] || "",
      detail: {
        title: [".heading_4_5.profile", ".profile", "h1.heading_2_4", ".heading_title", "h1"],
        company: [".company_name a", ".company-name", "a.link_display_like_text", ".company_and_premium a"],
        location: ["#location_names a", "#location_names span", ".location_link", ".locations a"],
        salary: [".stipend_container .stipend", ".salary_container .salary", ".stipend", ".salary"],
        description: [".internship_details .text-container", ".text-container", "#about_internship", ".internship_details"],
        skills: [".round_tabs_container .round_tabs", ".skills_heading + .round_tabs_container .round_tabs", "span.round_tabs", ".round_tabs"],
        titleFromDocTitle: (t) => { const m = t.match(/^(.+?)\s+at\s+(.+?)(?:\s*[|\-–]\s*Internshala.*)?$/i); return m ? { title: m[1], company: m[2] } : null; },
      },
      listCard: ["div.individual_internship", "div.internship_meta", "div[internshipid]", "div[data-internship_id]"],
      list: {
        title: ["a.job-title-href", ".job-internship-name a", "h3.job-internship-name", ".profile a", ".profile"],
        company: [".company-name", "p.company-name", ".company_name"],
        location: [".locations a", ".row-1-item.locations span", ".location_link", ".locations"],
        salary: [".stipend", "span.stipend", ".salary"],
        skills: [".round_tabs", ".skill_tags span"],
        description: [".about_job .text", ".detail-row-1"],
      },
    },
    wellfound: {
      label: "Wellfound",
      hosts: ["wellfound.com", "angel.co"],
      base: "https://wellfound.com",
      // Posting pages are /jobs/123-slug and /company/x/jobs/123-slug; the search page opens a
      // posting in a pane as /jobs?job_listing_slug=123-slug.
      isJobUrl: (u) => /\/jobs\/\d+/i.test(u.pathname) || /^\d+/.test(u.searchParams.get("job_listing_slug") || ""),
      idFromUrl: (u) => (u.pathname.match(/\/jobs\/(\d+)/i) || (u.searchParams.get("job_listing_slug") || "").match(/^(\d+)/) || [])[1] || "",
      canonicalUrl: (u) => {
        const slug = u.searchParams.get("job_listing_slug");
        return /^\d+/.test(slug || "") ? `${u.origin}/jobs/${slug}` : "";
      },
      detail: {
        title: ['[data-test="JobTitle"]', 'h1[class*="title"]', "h1"],
        company: ['a[href^="/company/"] h2', 'h2 a[href^="/company/"]', 'a[href^="/company/"]', '[data-test="StartupName"]'],
        location: ['[data-test="JobLocation"]', '[class*="location"]'],
        salary: ['[data-test="JobCompensation"]', '[class*="compensation"]', '[class*="salary"]'],
        description: ['[data-test="JobDescription"]', '[class*="description"]', "#job-description", "main section"],
        skills: ['[data-test="SkillTag"]', '[class*="skill"] a', '[class*="skill"] span', '[class*="Skill"]'],
        titleFromDocTitle: (t) => { const m = t.match(/^(.+?)\s+at\s+(.+?)(?:\s*[|\-–]\s*Wellfound.*)?$/i); return m ? { title: m[1], company: m[2] } : null; },
      },
      listCard: ['[data-test="StartupResult"]', '[class*="styles_component"]', "div[class*='JobListing']"],
      list: {
        title: ['a[href*="/jobs/"]'],
        company: ['a[href^="/company/"] h2', 'a[href^="/company/"]', '[data-test="StartupName"]'],
        location: ['[class*="location"]'],
        salary: ['[class*="compensation"]', '[class*="salary"]'],
        skills: ['[class*="skill"]'],
        description: [],
      },
    },
    unstop: {
      label: "Unstop",
      hosts: ["unstop.com"],
      base: "https://unstop.com",
      isJobUrl: (u) => /\/(jobs|internships)\/[^/]+-\d+\/?$/i.test(u.pathname),
      idFromUrl: (u) => (u.pathname.match(/-(\d+)\/?$/) || [])[1] || "",
      detail: {
        title: ["h1.opportunity-title", '[class*="opportunity"] h1', "h1"],
        company: [".org_name", ".org-name", ".company_name", '[class*="org_name"]', '[class*="company-name"]', "h2.organization", "app-opportunity-header h2"],
        location: [".location_list", '[class*="location"] span', '[class*="location"]'],
        salary: ['[class*="stipend"]', '[class*="salary"]', '[class*="ctc"]'],
        description: ["#about", ".about_opportunity", '[class*="job-description"]', '[class*="description"]', "app-opportunity-description"],
        skills: [".skill_list li", ".skills li", '[class*="skill"] .chip', '[class*="skill"] li', '[class*="skill"] span'],
        titleFromDocTitle: (t) => { const m = t.match(/^(.+?)\s+(?:at|-|–|\|)\s+(.+?)(?:\s*[|\-–]\s*Unstop.*)?$/i); return m ? { title: m[1], company: m[2] } : null; },
      },
      listCard: ["app-competition-listing", ".opportunity-card", ".single_profile", ".listing-card", "div[class*='opportunity-box']"],
      list: {
        title: ["h2", "h3", "a[title]", ".double-wrap h2", ".opp_title"],
        company: [".org-name", ".company-name", "p.org", '[class*="org"]'],
        location: ['[class*="location"]', ".location"],
        salary: ['[class*="stipend"]', '[class*="salary"]'],
        skills: [".skill_list li", ".chip"],
        description: [],
      },
    },
  };

  function detectPlatform(hostname) {
    const h = String(hostname || "").toLowerCase();
    return Object.keys(PLATFORMS).find((k) => PLATFORMS[k].hosts.some((d) => h === d || h.endsWith(`.${d}`))) || null;
  }

  // ------------------------------------------------------------ detail page
  function emptyDetail(sourceName, href) {
    return {
      role: "", company: "", location: "", description: "", descriptionStructured: "",
      salaryText: "", skills: [], contactEmail: "", employmentType: "", postedAt: "",
      externalJobId: "", sourceUrl: href || "", sourceName,
    };
  }

  // JSON-LD on SPAs (Wellfound/Unstop) can describe the PREVIOUS page after a
  // client-side navigation, so it is only trusted when it matches this URL.
  function ldIsCurrent(ld, loc, id) {
    if (!ld) return false;
    if (ld.url && id) return ld.url.includes(id);
    if (ld.url) { const u = safeUrl(ld.url); return !u || u.pathname === loc.pathname; }
    return true;
  }

  /**
   * Detail-page fields for one of the four new platforms. Never throws.
   */
  function extractDetail(key, doc, loc) {
    const P = PLATFORMS[key];
    const href = (loc && loc.href) || "";
    const out = emptyDetail(key, href);
    if (!P) return out;

    const view = doc.defaultView || null;
    const url = safeUrl(href);
    // Not a single-posting URL (home, search, profile...): report nothing rather than
    // mistaking the page's first <h1> for a job.
    if (!url || !P.isJobUrl(url)) return out;
    out.externalJobId = P.idFromUrl(url) || "";
    out.sourceUrl = (P.canonicalUrl && P.canonicalUrl(url)) || stripQuery(href);

    const D = P.detail;
    let ld = null;
    try { ld = fromJsonLd(doc); } catch (e) { ld = null; }
    if (!ldIsCurrent(ld, loc || {}, out.externalJobId)) ld = null;

    // layer 1: platform selectors
    out.role = firstText(doc, D.title);
    out.company = firstText(doc, D.company);
    out.location = firstText(doc, D.location);
    const salaryEl = firstText(doc, D.salary);
    out.salaryText = salaryFromElementText(salaryEl);
    out.skills = allTexts(doc, D.skills);
    const descEl = firstEl(doc, D.description);
    if (descEl) {
      const structured = structuredText(descEl, view);
      out.descriptionStructured = structured.slice(0, MAX_DESCRIPTION_CHARS);
      // flat text is derived from the visible structure, so script/hidden text never leaks into it
      out.description = clean(structured);
    }

    // layer 2: JSON-LD fills any blank
    if (ld) {
      out.role = out.role || ld.title;
      out.company = out.company || ld.company;
      out.location = out.location || ld.location;
      out.salaryText = out.salaryText || ld.salaryText;
      if (!out.skills.length) out.skills = ld.skills;
      out.employmentType = ld.employmentType;
      out.postedAt = ld.postedAt;
      if (!out.descriptionStructured && ld.descriptionHtml) {
        out.descriptionStructured = htmlToText(ld.descriptionHtml, view).slice(0, MAX_DESCRIPTION_CHARS);
        out.description = clean(out.descriptionStructured);
      }
    }

    // layer 3: <title> / og:title
    if (!out.role || !out.company) {
      const docTitle = clean((doc.title || "").replace(/^\(\d+\)\s*/, ""));
      const og = doc.querySelector('meta[property="og:title"]');
      const parsed = (docTitle && D.titleFromDocTitle(docTitle)) || (og && og.content && D.titleFromDocTitle(clean(og.content))) || null;
      if (parsed) {
        out.role = out.role || clean(parsed.title);
        out.company = out.company || clean(parsed.company);
      }
    }
    if (!out.description) {
      const md = doc.querySelector('meta[property="og:description"], meta[name="description"]');
      // a short meta summary is better than nothing, but it is flagged by length only
      if (md && md.content) { out.description = clean(md.content); out.descriptionStructured = out.description; }
    }

    // a stipend/salary can still live in the free text
    if (!out.salaryText) out.salaryText = findSalary(out.description.slice(0, 2000));
    out.contactEmail = findContactEmail(out.descriptionStructured || out.description);
    out.company = out.company.replace(/\s*(?:·|\|)\s*(?:follow|hiring).*$/i, "");
    return out;
  }

  // ------------------------------------------------------------ list page
  function cardFor(anchor, P) {
    for (const sel of P.listCard) {
      try { const c = anchor.closest(sel); if (c) return c; } catch (e) { /* ignore */ }
    }
    // fallback: climb until the parent holds more than one distinct posting link
    let node = anchor;
    for (let i = 0; i < 6 && node.parentElement; i += 1) {
      const parent = node.parentElement;
      const links = new Set();
      parent.querySelectorAll("a[href]").forEach((a) => {
        const u = safeUrl(absUrl(a.getAttribute("href"), a.ownerDocument.location && a.ownerDocument.location.href));
        if (u && P.isJobUrl(u)) links.add(P.idFromUrl(u) || u.pathname);
      });
      if (links.size > 1) return node;
      node = parent;
    }
    return anchor.parentElement || anchor;
  }

  /**
   * Search-result cards -> partial jobs (no full description). `opts.limit`
   * caps the count. Never throws; unparseable cards are skipped.
   */
  function extractList(key, doc, loc, opts) {
    const P = PLATFORMS[key];
    if (!P) return [];
    const limit = Math.max(1, Number(opts && opts.limit) || 25);
    const base = (loc && loc.href) || P.base;
    const seen = new Set();
    const jobs = [];

    let anchors = [];
    try { anchors = Array.from(doc.querySelectorAll("a[href]")); } catch (e) { return jobs; }

    for (const a of anchors) {
      if (jobs.length >= limit) break;
      let abs = "";
      try { abs = absUrl(a.getAttribute("href"), base); } catch (e) { continue; }
      const u = abs && safeUrl(abs);
      if (!u || !P.hosts.some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`)) || !P.isJobUrl(u)) continue;
      const id = P.idFromUrl(u) || u.pathname;
      if (seen.has(id)) continue;

      const card = cardFor(a, P);
      const L = P.list;
      let title = firstText(card, L.title) || clean(a.getAttribute("title")) || text(a);
      if (!title || title.length > 200) continue;
      seen.add(id);

      const cardText = text(card);
      jobs.push({
        title,
        company: firstText(card, L.company),
        location: firstText(card, L.location),
        sourceUrl: (P.canonicalUrl && P.canonicalUrl(u)) || stripQuery(abs),
        externalJobId: P.idFromUrl(u) || "",
        salaryText: salaryFromElementText(firstText(card, L.salary)) || findSalary(cardText),
        skills: allTexts(card, L.skills),
        description: firstText(card, L.description || []),
      });
    }
    return jobs;
  }

  return {
    PLATFORMS,
    detectPlatform,
    extractDetail,
    extractList,
    helpers: { clean, text, firstText, firstEl, allTexts, structuredText, htmlToText, findSalary, salaryFromElementText, findContactEmail, fromJsonLd, readJsonLd, absUrl, stripQuery },
  };
});
