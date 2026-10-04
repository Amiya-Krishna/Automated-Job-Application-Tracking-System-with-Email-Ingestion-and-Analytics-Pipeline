import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { loadPage } from "./helpers.js";

// Fixtures mimic the structure of each platform's posting page (hashed class names,
// schema.org JSON-LD, <title> patterns). Real sites change often; what these tests pin
// down is the layered fallback behaviour, not any one site's markup.
const SCRIPTS = ["platform-extractors.js", "jd-extract.js"];
const detect = (html, url) => {
  const dom = loadPage(html, url, { scripts: SCRIPTS });
  const X = dom.window.TrackTrailExtract;
  return { d: JSON.parse(JSON.stringify(X.detectJob(dom.window.document, dom.window.location))), X, dom };
};

const NAUKRI_HTML = `<!doctype html><html><head><title>Python Developer - Acme Technologies - Bengaluru - 2 to 5 years | Naukri.com</title></head><body>
<header><h1 class="styles_jd-header-title__rZwM1">Python Developer</h1>
<div class="styles_jd-header-comp-name__MvqAI"><a href="/acme-jobs">Acme Technologies</a></div>
<div class="styles_jhc__loc___Du2H"><span class="styles_jhc__location__W_pVs"><a>Bengaluru</a>, <a>Remote</a></span></div>
<div class="styles_jhc__salary__jdfEC"><span>6-10 Lacs PA</span></div></header>
<section class="styles_job-desc-container__txpYf">
<div class="styles_JDC__dang-inner-html__h0K4t"><p><b>Roles and Responsibilities</b></p><ul><li>Build REST APIs in Django</li><li>Write unit tests</li></ul>
<p>Send your CV to careers@acme-tech.com or noreply@naukri.com</p></div>
<div class="styles_key-skill__GIPn_"><a><span>Python</span></a><a><span>Django</span></a><a><span>SQL</span></a></div></section></body></html>`;
const NAUKRI_URL = "https://www.naukri.com/job-listings-python-developer-acme-technologies-bengaluru-2-to-5-years-120924012345?src=jobsearchDesk&sid=1";

test("Naukri: fields, salary, skills, contact email, id and clean URL", () => {
  const { d } = detect(NAUKRI_HTML, NAUKRI_URL);
  assert.equal(d.sourceName, "naukri");
  assert.equal(d.role, "Python Developer");
  assert.equal(d.company, "Acme Technologies");
  assert.match(d.location, /Bengaluru/);
  assert.equal(d.salaryText, "6-10 Lacs PA");
  assert.deepEqual(d.skills, ["Python", "Django", "SQL"]);
  assert.equal(d.externalJobId, "120924012345");
  assert.equal(d.sourceUrl, "https://www.naukri.com/job-listings-python-developer-acme-technologies-bengaluru-2-to-5-years-120924012345");
  assert.ok(d.descriptionStructured.split("\n").includes("- Build REST APIs in Django"));
  assert.equal(d.contactEmail, "careers@acme-tech.com"); // noreply@ is never offered
});

const INTERNSHALA_HTML = `<!doctype html><html><head><title>Web Development Internship at Globex | Internshala</title></head><body>
<div class="heading_4_5 profile">Web Development</div>
<div class="company_name"><a class="link_display_like_text">Globex</a></div>
<div id="location_names"><span><a class="location_link">Work from home</a></span></div>
<div class="stipend_container"><span class="stipend">₹ 10,000 - 15,000 /month</span></div>
<div class="internship_details"><div class="text-container">Work on our React front end.<br>Contact hr@globex.in for queries.</div></div>
<div class="round_tabs_container"><span class="round_tabs">React</span><span class="round_tabs">CSS</span></div></body></html>`;
const INTERNSHALA_URL = "https://internshala.com/internship/detail/work-from-home-web-development-internship-at-globex1712345678?utm_source=x";

test("Internshala: stipend, skills, id and URL", () => {
  const { d } = detect(INTERNSHALA_HTML, INTERNSHALA_URL);
  assert.equal(d.sourceName, "internshala");
  assert.equal(d.role, "Web Development");
  assert.equal(d.company, "Globex");
  assert.equal(d.location, "Work from home");
  assert.match(d.salaryText, /10,000/);
  assert.deepEqual(d.skills, ["React", "CSS"]);
  assert.equal(d.externalJobId, "1712345678");
  assert.equal(d.sourceUrl, "https://internshala.com/internship/detail/work-from-home-web-development-internship-at-globex1712345678");
  assert.equal(d.contactEmail, "hr@globex.in");
});

test("Internshala: unpaid stipend is kept as stated; a missing stipend stays empty", () => {
  const unpaid = INTERNSHALA_HTML.replace("₹ 10,000 - 15,000 /month", "Unpaid");
  assert.equal(detect(unpaid, INTERNSHALA_URL).d.salaryText, "Unpaid");
  const none = INTERNSHALA_HTML.replace(/<div class="stipend_container">.*?<\/div>/, "");
  assert.equal(detect(none, INTERNSHALA_URL).d.salaryText, "");
});

const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
const WELLFOUND_HTML = (url) => `<!doctype html><html><head><title>Senior Backend Engineer at Initech | Wellfound</title>${jsonLd({
  "@context": "https://schema.org", "@type": "JobPosting", title: "Senior Backend Engineer", url,
  hiringOrganization: { "@type": "Organization", name: "Initech" },
  jobLocation: { "@type": "Place", address: { addressLocality: "San Francisco", addressRegion: "CA", addressCountry: "US" } },
  baseSalary: { "@type": "MonetaryAmount", currency: "USD", value: { "@type": "QuantitativeValue", minValue: 150000, maxValue: 190000, unitText: "YEAR" } },
  description: "<p>Own our Go services.</p><ul><li>Kubernetes</li><li>Postgres</li></ul>",
  skills: "Go, Kubernetes, Postgres",
})}</head><body><div id="root"></div></body></html>`;
const WF_URL = "https://wellfound.com/jobs/3456789-senior-backend-engineer";

test("Wellfound: a JSON-LD-only (SSR) page still yields every field", () => {
  const { d } = detect(WELLFOUND_HTML(WF_URL), WF_URL);
  assert.equal(d.sourceName, "wellfound");
  assert.equal(d.role, "Senior Backend Engineer");
  assert.equal(d.company, "Initech");
  assert.equal(d.location, "San Francisco, CA, US");
  assert.equal(d.salaryText, "USD 150,000 - 190,000 / year");
  assert.deepEqual(d.skills, ["Go", "Kubernetes", "Postgres"]);
  assert.equal(d.externalJobId, "3456789");
  assert.ok(d.descriptionStructured.includes("- Kubernetes"));
});

test("Wellfound: stale JSON-LD from a previous SPA route is ignored", () => {
  const stale = WELLFOUND_HTML("https://wellfound.com/jobs/1111111-old-job");
  const { d } = detect(stale, WF_URL);
  assert.equal(d.role, "Senior Backend Engineer"); // from <title> fallback, not from the stale block
  assert.equal(d.salaryText, "");
  assert.equal(d.description, "");
});

test("Wellfound: the search pane URL (?job_listing_slug=) is recognised and canonicalised", () => {
  const url = "https://wellfound.com/jobs?job_listing_slug=3456789-senior-backend-engineer&foo=1";
  const { d } = detect(WELLFOUND_HTML("https://wellfound.com/jobs/3456789-senior-backend-engineer"), url);
  assert.equal(d.externalJobId, "3456789");
  assert.equal(d.sourceUrl, "https://wellfound.com/jobs/3456789-senior-backend-engineer");
});

test("non-posting pages on the new platforms report nothing (no dock on home/search/profile pages)", () => {
  for (const url of ["https://wellfound.com/", "https://unstop.com/jobs", "https://internshala.com/internships/", "https://www.naukri.com/python-jobs"]) {
    const { d } = detect("<html><body><h1>Find your next role</h1></body></html>", url);
    assert.equal(d.role, "", url);
    assert.equal(d.company, "", url);
  }
});

const UNSTOP_HTML = `<!doctype html><html><head><title>Data Science Intern - Hooli | Unstop</title></head><body>
<app-opportunity-header><h1 class="opportunity-title">Data Science Intern</h1><h2 class="org_name">Hooli</h2></app-opportunity-header>
<div class="location_list">Hybrid - Pune</div><div class="stipend">₹ 25,000 /month</div>
<div id="about"><p>Analyse large datasets.</p><p>Apply at jobs@hooli.com</p></div>
<ul class="skill_list"><li>Python</li><li>Pandas</li></ul></body></html>`;
test("Unstop: internship page", () => {
  const url = "https://unstop.com/internships/data-science-intern-hooli-987654?lb=abc";
  const { d } = detect(UNSTOP_HTML, url);
  assert.equal(d.sourceName, "unstop");
  assert.equal(d.role, "Data Science Intern");
  assert.equal(d.company, "Hooli");
  assert.equal(d.location, "Hybrid - Pune");
  assert.equal(d.salaryText, "₹ 25,000 /month");
  assert.deepEqual(d.skills, ["Python", "Pandas"]);
  assert.equal(d.externalJobId, "987654");
  assert.equal(d.sourceUrl, "https://unstop.com/internships/data-science-intern-hooli-987654");
  assert.equal(d.contactEmail, "jobs@hooli.com");
});

test("unknown markup degrades to title/company from <title>, never throws, never invents fields", () => {
  const { d } = detect("<html><head><title>QA Engineer - Pied Piper | Unstop</title></head><body><p>nothing</p></body></html>", "https://unstop.com/jobs/qa-engineer-pied-piper-4242");
  assert.equal(d.role, "QA Engineer");
  assert.equal(d.company, "Pied Piper");
  assert.deepEqual([d.location, d.salaryText, d.description], ["", "", ""]);
  assert.deepEqual(d.skills, []);
});

test("malformed JSON-LD and hostile content do not break extraction", () => {
  const html = `<html><head><title>Role at Evil | Wellfound</title><script type="application/ld+json">{not json</script></head><body><h1>Role</h1><div data-test="JobDescription"><img src=x onerror="window.pwned=1"><script>window.pwned=2</script>Real text</div></body></html>`;
  const { d, dom } = detect(html, "https://wellfound.com/jobs/55-role");
  assert.equal(d.role, "Role");
  assert.match(d.description, /Real text/);
  assert.doesNotMatch(d.description, /pwned/);
  assert.equal(dom.window.pwned, undefined);
});

test("toSaveJob carries salary/skills/URL only when found; the original payload is otherwise unchanged", () => {
  const { d, X } = detect(NAUKRI_HTML, NAUKRI_URL);
  const payload = JSON.parse(JSON.stringify(X.toSaveJob(d, "www.naukri.com")));
  assert.equal(payload.sourceName, "naukri");
  assert.equal(payload.salaryText, "6-10 Lacs PA");
  assert.deepEqual(payload.skills, ["Python", "Django", "SQL"]);
  assert.match(payload.sourceUrl, /^https:\/\/www\.naukri\.com\/job-listings-/);
  assert.match(payload.notes, /Contact: careers@acme-tech\.com/);
  const bare = JSON.parse(JSON.stringify(X.toSaveJob({ sourceName: "x", sourceUrl: "u" }, "h")));
  assert.equal("salaryText" in bare, false);
  assert.equal("skills" in bare, false);
});

// ---------------------------------------------------------- URL reliability (LinkedIn / Indeed)
test("LinkedIn: slug-style posting URLs keep their id and canonical link", () => {
  const { d } = detect("<html><head><title>Role | Acme | LinkedIn</title></head><body></body></html>",
    "https://in.linkedin.com/jobs/view/software-engineer-intern-at-acme-3912345678?refId=abc&trackingId=def");
  assert.equal(d.externalJobId, "3912345678");
  assert.equal(d.sourceUrl, "https://www.linkedin.com/jobs/view/3912345678/");
});

test("Indeed: search page with the pane open (vjk) and country hosts resolve to the posting, not the search page", () => {
  const { d } = detect("<html><head><title>Dev - Globex - Pune | Indeed</title></head><body></body></html>",
    "https://in.indeed.com/jobs?q=developer&l=Pune&vjk=0123456789abcdef");
  assert.equal(d.externalJobId, "0123456789abcdef");
  assert.equal(d.sourceUrl, "https://in.indeed.com/viewjob?jk=0123456789abcdef");
});

test("Indeed: id from the canonical link when the address bar has none", () => {
  const { d } = detect(`<html><head><link rel="canonical" href="https://www.indeed.com/viewjob?jk=aaaabbbbccccdddd"><title>Dev - Globex - Pune | Indeed</title></head><body></body></html>`,
    "https://www.indeed.com/jobs?q=dev");
  assert.equal(d.sourceUrl, "https://www.indeed.com/viewjob?jk=aaaabbbbccccdddd");
});

test("LinkedIn / Indeed also report salary when the page shows one, without disturbing the existing fields", () => {
  const html = `<html><head><title>Dev | Acme | LinkedIn</title></head><body><h1 class="top-card-layout__title">Dev</h1>
  <a class="topcard__org-name-link top-card-layout__second-subline">x</a>
  <div class="job-details-jobs-unified-top-card__company-name">Acme</div>
  <div class="salary compensation__salary">$90K/yr - $120K/yr</div><div id="job-details">Build things</div></body></html>`;
  const { d } = detect(html, "https://www.linkedin.com/jobs/view/3912345678/");
  assert.equal(d.role, "Dev");
  assert.equal(d.company, "Acme");
  assert.match(d.salaryText, /\$90K/);
});

// ---------------------------------------------------------- search-result lists (server discovery)
test("extractList: finds posting links, builds clean URLs, dedupes, honours the limit", () => {
  const html = `<html><body>
  <div class="srp-jobtuple-wrapper"><a class="title" href="https://www.naukri.com/job-listings-dev-acme-pune-120924000001?x=1">Dev</a><a class="comp-name">Acme</a>
    <span class="locWraper">Pune</span><span class="sal-wrap"><span>5-8 Lacs PA</span></span><ul class="tags-gt"><li>Java</li><li>Spring</li></ul></div>
  <div class="srp-jobtuple-wrapper"><a class="title" href="/job-listings-qa-globex-delhi-120924000002">QA</a><a class="comp-name">Globex</a><span class="locWraper">Delhi</span></div>
  <div class="srp-jobtuple-wrapper"><a class="title" href="/job-listings-qa-globex-delhi-120924000002">QA again</a></div>
  <a href="/about">About</a></body></html>`;
  const dom = new JSDOM(html, { url: "https://www.naukri.com/dev-jobs", runScripts: "outside-only" });
  dom.window.eval(JSON.stringify("")); // no-op: ensure window usable
  const X = dom.window.eval(`${loadSource()}; TrackTrailPlatforms`);
  const jobs = JSON.parse(JSON.stringify(X.extractList("naukri", dom.window.document, dom.window.location, { limit: 5 })));
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs[0], {
    title: "Dev", company: "Acme", location: "Pune", sourceUrl: "https://www.naukri.com/job-listings-dev-acme-pune-120924000001",
    externalJobId: "120924000001", salaryText: "5-8 Lacs PA", skills: ["Java", "Spring"], description: "",
  });
  assert.equal(jobs[1].sourceUrl, "https://www.naukri.com/job-listings-qa-globex-delhi-120924000002");
  assert.equal(X.extractList("naukri", dom.window.document, dom.window.location, { limit: 1 }).length, 1);
});

function loadSource() {
  return src("platform-extractors.js");
}
import { src } from "./helpers.js";
