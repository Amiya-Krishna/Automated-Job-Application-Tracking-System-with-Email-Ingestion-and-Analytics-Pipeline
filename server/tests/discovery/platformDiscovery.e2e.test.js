// End-to-end web discovery for the four new boards, through the REAL adapters
// (createJobBoardAdapter -> makeScraper -> shared extractor injected into a real Chromium).
// All network traffic is intercepted and answered from fixtures, so nothing touches the real
// sites. Skipped automatically when no Chromium is available.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = ["/opt/pw-browsers/chromium", process.env.CHROMIUM_PATH].filter(Boolean).find((p) => { try { return fs.statSync(p).isFile() || fs.statSync(p).isDirectory(); } catch { return false; } });
const real = require("playwright");
let exe = null;
if (CHROME) {
  try {
    const cand = fs.statSync(CHROME).isDirectory() ? fs.readdirSync(CHROME).map((f) => path.join(CHROME, f)) : [CHROME];
    exe = cand.find((p) => /chrome$/.test(p) && fs.statSync(p).isFile()) || null;
    if (!exe && fs.statSync(CHROME).isFile()) exe = CHROME;
  } catch { /* none */ }
}
if (!exe) {
  const base = "/opt/pw-browsers";
  try { for (const d of fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d))) { const p = path.join(base, d, "chrome-linux", "chrome"); if (fs.existsSync(p)) exe = p; } } catch { /* none */ }
}

const ld = (o) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "JobPosting", ...o })}</script>`;
const JD = { title: "Data Engineer", hiringOrganization: { name: "Initech" }, jobLocation: { address: { addressLocality: "Hyderabad" } }, description: "<p>Build pipelines.</p><ul><li>Own ETL jobs</li></ul>", skills: "Spark, Airflow", baseSalary: { currency: "INR", value: { minValue: 1200000, maxValue: 1800000, unitText: "YEAR" } } };

const PAGES = {
  naukri: {
    detailPath: "/job-listings-data-engineer-initech-hyderabad-120924099999",
    search: `<html><body><div class="srp-jobtuple-wrapper"><a class="title" href="https://www.naukri.com/job-listings-data-engineer-initech-hyderabad-120924099999?src=x">Data Engineer</a><a class="comp-name">Initech</a><span class="locWraper">Hyderabad</span></div>
      <div class="srp-jobtuple-wrapper"><a class="title" href="javascript:alert(1)">Bad link</a><a class="comp-name">Evil</a></div></body></html>`,
    detail: `<html><head><title>Data Engineer - Initech | Naukri.com</title></head><body><h1 class="styles_jd-header-title__x">Data Engineer</h1><div class="styles_jd-header-comp-name__x"><a>Initech</a></div>
      <div class="styles_jhc__salary__x"><span>12-18 Lacs PA</span></div><section class="styles_job-desc-container__x"><div class="styles_JDC__dang-inner-html__x"><p>Build pipelines.</p></div><div class="styles_key-skill__x"><a><span>Spark</span></a><a><span>Airflow</span></a></div></section></body></html>`,
  },
  internshala: {
    detailPath: "/internship/detail/data-engineering-internship-at-initech1712345678",
    search: `<html><body><div class="individual_internship" internshipid="1712345678"><a class="job-title-href" href="/internship/detail/data-engineering-internship-at-initech1712345678">Data Engineering</a><p class="company-name">Initech</p><div class="locations"><a>Hyderabad</a></div></div></body></html>`,
    detail: `<html><head><title>Data Engineering Internship at Initech | Internshala</title></head><body><div class="heading_4_5 profile">Data Engineering</div><div class="company_name"><a>Initech</a></div><div class="stipend_container"><span class="stipend">₹ 20,000 /month</span></div>
      <div class="internship_details"><div class="text-container">Build pipelines.</div></div><div class="round_tabs_container"><span class="round_tabs">Spark</span><span class="round_tabs">SQL</span></div></body></html>`,
  },
  wellfound: {
    detailPath: "/jobs/3456789-data-engineer",
    search: `<html><body><div data-test="StartupResult"><a href="/company/initech"><h2>Initech</h2></a><a href="/jobs/3456789-data-engineer">Data Engineer</a><span class="location">Hyderabad</span></div></body></html>`,
    detail: `<html><head><title>Data Engineer at Initech | Wellfound</title>${ld({ ...JD, url: "https://wellfound.com/jobs/3456789-data-engineer" })}</head><body><div id="root"></div></body></html>`, // JSON-LD only
  },
  unstop: {
    detailPath: "/internships/data-engineering-intern-initech-1234567",
    search: `<html><body><div class="opportunity-card"><h2>Data Engineering Intern</h2><p class="org-name">Initech</p><a href="/internships/data-engineering-intern-initech-1234567">View</a></div></body></html>`,
    detail: `<html><head><title>Data Engineering Intern - Initech | Unstop</title>${ld({ ...JD, url: "https://unstop.com/internships/data-engineering-intern-initech-1234567" })}</head><body></body></html>`,
  },
};

// route table: per-run overrides decide what the "site" answers
async function run(name, { search, detail, detailFails, slow } = {}) {
  const P = PAGES[name];
  process.env.SCRAPE_DETAIL_LIMIT = "5";
  process.env.SCRAPE_SELECTOR_WAIT_MS = "800";
  const fake = {
    chromium: {
      launch: async (opts) => {
        const browser = await real.chromium.launch({ ...opts, executablePath: exe, args: ["--no-sandbox", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run", "--disable-features=OptimizationHints,Translate"] });
        const newContext = browser.newContext.bind(browser);
        browser.newContext = async (o) => {
          const ctx = await newContext(o);
          await ctx.route("**/*", async (route) => {
            const url = new URL(route.request().url());
            if (route.request().resourceType() !== "document") return route.abort();
            if (url.pathname === P.detailPath) {
              if (detailFails) return route.abort();
              return route.fulfill({ status: 200, contentType: "text/html", body: detail ?? P.detail });
            }
            return route.fulfill({ status: 200, contentType: "text/html", body: search ?? P.search });
          });
          return ctx;
        };
        return browser;
      },
    },
  };
  const id = require.resolve("playwright");
  const saved = require.cache[id];
  require.cache[id] = { id, filename: id, loaded: true, exports: fake };
  for (const m of Object.keys(require.cache)) if (/adapters[\\/](createJobBoardAdapter|\w+JobsAdapter)\.js$/.test(m)) delete require.cache[m];
  try {
    const adapter = require(`../../adapters/${name}JobsAdapter`);
    return await adapter.discover({ query: "data engineer", location: "Hyderabad", limit: 5 });
  } finally { require.cache[id] = saved; }
}

const skip = exe ? false : "no Chromium available";

for (const name of Object.keys(PAGES)) {
  test(`${name}: discovery returns normalized jobs with detail-page salary/skills and a clean direct URL`, { skip, timeout: 120000 }, async () => {
    const r = await run(name);
    assert.equal(r.status, "ok", r.message);
    assert.equal(r.jobs.length, 1, `got ${JSON.stringify(r.jobs.map((j) => j.sourceUrl))}`); // javascript: link dropped
    const j = r.jobs[0];
    assert.equal(j.sourceName, name);
    assert.match(j.title, /Data Engineer|Data Engineering/);
    assert.match(j.company, /Initech/);
    assert.ok(/^https:\/\//.test(j.sourceUrl) && !/[?#]/.test(j.sourceUrl), j.sourceUrl);
    assert.ok(j.externalJobId);
    assert.ok(j.salaryText && /\d/.test(j.salaryText), `salary ${j.salaryText}`);
    assert.ok(j.skills && j.skills.length >= 2, `skills ${JSON.stringify(j.skills)}`);
    assert.ok(j.description.length > 5, "description");
  });

  test(`${name}: a bot-check page is reported as blocked, not as zero results`, { skip, timeout: 120000 }, async () => {
    const r = await run(name, { search: "<html><head><title>Just a moment...</title></head><body>Verify you are human to continue. Access Denied</body></html>" });
    assert.equal(r.status, "blocked");
    assert.deepEqual(r.jobs, []);
    assert.match(r.message, /bot-check|access wall/i);
  });

  test(`${name}: changed DOM (no recognisable postings) -> ok with an empty list, never a crash`, { skip, timeout: 120000 }, async () => {
    const r = await run(name, { search: "<html><body><div class='totally-new-layout'><span>Nothing familiar</span></div></body></html>" });
    assert.equal(r.status, "ok");
    assert.deepEqual(r.jobs, []);
  });

  test(`${name}: if the detail page fails, list-level data is still returned (missing salary/skills tolerated)`, { skip, timeout: 120000 }, async () => {
    const r = await run(name, { detailFails: true });
    assert.equal(r.status, "ok", r.message);
    assert.equal(r.jobs.length, 1);
    assert.ok(r.jobs[0].sourceUrl && r.jobs[0].title && r.jobs[0].company);
  });

  test(`${name}: detail page with a bot wall stops detail visits but keeps the list results`, { skip, timeout: 120000 }, async () => {
    const r = await run(name, { detail: "<html><head><title>Access Denied</title></head><body>Access Denied</body></html>" });
    assert.equal(r.status, "ok", r.message);
    assert.equal(r.jobs.length, 1);
  });
}

test("all six platforms reuse ONE adapter factory and the SAME extractor file as the browser extension", () => {
  const root = path.join(__dirname, "..", "..");
  for (const n of ["linkedin", "indeed", "naukri", "internshala", "wellfound", "unstop"]) {
    assert.match(fs.readFileSync(path.join(root, "adapters", `${n}JobsAdapter.js`), "utf8"), /createJobBoardAdapter/, n);
  }
  const ext = fs.readFileSync(path.join(root, "..", "browser-extension", "platform-extractors.js"), "utf8");
  assert.equal(fs.readFileSync(path.join(root, "services/jobBoards/platformExtractors.js"), "utf8"), ext);
  const reg = fs.readFileSync(path.join(root, "services/jobDiscovery/index.js"), "utf8");
  for (const n of ["naukri", "internshala", "wellfound", "unstop"]) assert.match(reg, new RegExp(n));
});
