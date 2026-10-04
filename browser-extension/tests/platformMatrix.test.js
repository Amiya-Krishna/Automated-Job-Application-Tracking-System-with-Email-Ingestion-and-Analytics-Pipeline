import test from "node:test";
import assert from "node:assert/strict";
import { loadPage } from "./helpers.js";

// One full-field fixture per platform. For each: title, company, location, description,
// salary/stipend, skills, source and the direct job URL must all come out of the REAL
// content scripts, and toSaveJob must carry them (and the URL) to the backend payload.
const SCRIPTS = ["platform-extractors.js", "jd-extract.js"];
const ld = (o) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "JobPosting", ...o })}</script>`;
const JD = { title: "Data Engineer", hiringOrganization: { name: "Initech" }, jobLocation: { address: { addressLocality: "Hyderabad", addressCountry: "IN" } },
  description: "<p>Build pipelines.</p><ul><li>Own ETL jobs</li></ul>", skills: "Spark, Airflow, SQL",
  baseSalary: { currency: "INR", value: { minValue: 1200000, maxValue: 1800000, unitText: "YEAR" } } };

const CASES = [
  { name: "linkedin", url: "https://www.linkedin.com/jobs/view/3912345678/?trk=x", sourceUrl: "https://www.linkedin.com/jobs/view/3912345678/", id: "3912345678",
    html: `<html><head><title>Data Engineer | Initech | LinkedIn</title>${ld({ ...JD, url: "https://www.linkedin.com/jobs/view/3912345678/" })}</head><body>
      <h1 class="job-details-jobs-unified-top-card__job-title">Data Engineer</h1><div class="job-details-jobs-unified-top-card__company-name">Initech</div>
      <div class="job-details-jobs-unified-top-card__primary-description-container"><span class="tvm__text">Hyderabad, Telangana, India</span></div><div id="job-details"><p>Build pipelines.</p><ul><li>Own ETL jobs</li></ul></div></body></html>` },
  { name: "indeed", url: "https://in.indeed.com/jobs?q=data&vjk=0123456789abcdef", sourceUrl: "https://in.indeed.com/viewjob?jk=0123456789abcdef", id: "0123456789abcdef",
    html: `<html><head><title>Data Engineer - Initech - Hyderabad | Indeed</title>${ld(JD)}</head><body>
      <h1 data-testid="jobsearch-JobInfoHeader-title">Data Engineer</h1><div data-testid="inlineHeader-companyName">Initech</div><div data-testid="inlineHeader-companyLocation">Hyderabad, TS</div>
      <div id="salaryInfoAndJobType"><span>₹12,00,000 - ₹18,00,000 a year</span></div><div id="jobDescriptionText">Build pipelines.<br>Own ETL jobs</div></body></html>` },
  { name: "naukri", url: "https://www.naukri.com/job-listings-data-engineer-initech-hyderabad-3-to-6-years-120924099999?src=x", id: "120924099999",
    sourceUrl: "https://www.naukri.com/job-listings-data-engineer-initech-hyderabad-3-to-6-years-120924099999",
    html: `<html><head><title>Data Engineer - Initech - Hyderabad | Naukri.com</title></head><body><h1 class="styles_jd-header-title__x">Data Engineer</h1>
      <div class="styles_jd-header-comp-name__x"><a>Initech</a></div><div class="styles_jhc__loc___x"><span class="styles_jhc__location__x"><a>Hyderabad</a></span></div>
      <div class="styles_jhc__salary__x"><span>12-18 Lacs PA</span></div><section class="styles_job-desc-container__x"><div class="styles_JDC__dang-inner-html__x"><p>Build pipelines.</p><ul><li>Own ETL jobs</li></ul></div>
      <div class="styles_key-skill__x"><a><span>Spark</span></a><a><span>Airflow</span></a></div></section></body></html>` },
  { name: "internshala", url: "https://internshala.com/internship/detail/data-engineering-internship-at-initech1712345678?utm=x", id: "1712345678",
    sourceUrl: "https://internshala.com/internship/detail/data-engineering-internship-at-initech1712345678",
    html: `<html><head><title>Data Engineering Internship at Initech | Internshala</title></head><body><div class="heading_4_5 profile">Data Engineering</div>
      <div class="company_name"><a class="link_display_like_text">Initech</a></div><div id="location_names"><span><a class="location_link">Hyderabad</a></span></div>
      <div class="stipend_container"><span class="stipend">₹ 20,000 /month</span></div><div class="internship_details"><div class="text-container">Build pipelines.<br>Own ETL jobs</div></div>
      <div class="round_tabs_container"><span class="round_tabs">Spark</span><span class="round_tabs">SQL</span></div></body></html>` },
  { name: "wellfound", url: "https://wellfound.com/jobs/3456789-data-engineer", id: "3456789", sourceUrl: "https://wellfound.com/jobs/3456789-data-engineer",
    html: `<html><head><title>Data Engineer at Initech | Wellfound</title>${ld({ ...JD, url: "https://wellfound.com/jobs/3456789-data-engineer" })}</head><body><div id="root"></div></body></html>` },
  { name: "unstop", url: "https://unstop.com/internships/data-engineering-intern-initech-1234567?lb=x", id: "1234567", sourceUrl: "https://unstop.com/internships/data-engineering-intern-initech-1234567",
    html: `<html><head><title>Data Engineering Intern - Initech | Unstop</title>${ld({ ...JD, url: "https://unstop.com/internships/data-engineering-intern-initech-1234567" })}</head><body></body></html>` },
];

for (const c of CASES) {
  test(`${c.name}: title, company, location, description, salary, skills, source and direct URL`, () => {
    const dom = loadPage(c.html, c.url, { scripts: SCRIPTS });
    const X = dom.window.TrackTrailExtract;
    const d = JSON.parse(JSON.stringify(X.detectJob(dom.window.document, dom.window.location)));
    assert.equal(d.sourceName, c.name, "source");
    assert.match(d.role, /Data Engineer/, "title");
    assert.match(d.company, /Initech/, "company");
    assert.match(d.location, /Hyderabad/, "location");
    assert.match(d.description, /pipelines/, "description");
    assert.ok(d.salaryText && /\d/.test(d.salaryText), `salary/stipend (${d.salaryText})`);
    assert.ok(Array.isArray(d.skills) && d.skills.length >= 2, `skills (${JSON.stringify(d.skills)})`);
    assert.equal(d.sourceUrl, c.sourceUrl, "direct, clean job URL");
    assert.equal(d.externalJobId, c.id, "job id");
    const save = JSON.parse(JSON.stringify(X.toSaveJob(d, "host")));
    for (const k of ["company", "role", "location", "description", "sourceName", "sourceUrl", "externalJobId", "salaryText", "skills"]) assert.ok(save[k], `payload.${k}`);
    assert.equal(save.sourceUrl, c.sourceUrl);
  });
}

test("LinkedIn / Indeed ignore STALE JSON-LD from a previously viewed posting (SPA navigation)", () => {
  const stale = ld({ ...JD, url: "https://www.linkedin.com/jobs/view/1111111111/", skills: "Cobol" });
  const dom = loadPage(`<html><head><title>Data Engineer | Initech | LinkedIn</title>${stale}</head><body><h1 class="job-details-jobs-unified-top-card__job-title">Data Engineer</h1><div id="job-details">x</div></body></html>`,
    "https://www.linkedin.com/jobs/view/3912345678/", { scripts: SCRIPTS });
  const X = dom.window.TrackTrailExtract;
  const d = X.detectJob(dom.window.document, dom.window.location);
  assert.equal(d.skills, undefined);
  assert.equal(d.salaryText, undefined);
});

test("missing salary and missing skills are simply omitted (no placeholders) on every platform", () => {
  for (const c of CASES) {
    const bare = `<html><head><title>${c.name === "indeed" ? "Data Engineer - Initech - Pune | Indeed" : "Data Engineer | Initech | LinkedIn"}</title></head><body></body></html>`;
    const dom = loadPage(bare, c.url, { scripts: SCRIPTS });
    const X = dom.window.TrackTrailExtract;
    const d = X.detectJob(dom.window.document, dom.window.location);
    const save = X.toSaveJob(d || { sourceName: c.name, sourceUrl: c.sourceUrl }, "h");
    assert.equal("salaryText" in save, false, c.name);
    assert.equal("skills" in save, false, c.name);
  }
});
