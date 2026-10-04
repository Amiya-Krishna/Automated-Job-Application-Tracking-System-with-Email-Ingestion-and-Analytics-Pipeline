const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

test("server copy of the extractors matches the extension's single source of truth", () => {
  const ext = path.resolve(__dirname, "../../../browser-extension/platform-extractors.js");
  if (!fs.existsSync(ext)) return; // server deployed on its own
  assert.equal(fs.readFileSync(ext, "utf8"), fs.readFileSync(path.resolve(__dirname, "../../services/jobBoards/platformExtractors.js"), "utf8"), "run: npm run sync:extractors");
});

test("server-side list + detail extraction works through the same module", () => {
  const X = require("../../services/jobBoards/platformExtractors");
  const html = `<div class="individual_internship"><a class="job-title-href" href="/internship/detail/python-internship-at-acme1700000001">Python Internship</a><p class="company-name">Acme</p><span class="stipend">₹ 8,000 /month</span></div>`;
  const dom = new JSDOM(html, { url: "https://internshala.com/internships/keywords-python" });
  const jobs = X.extractList("internshala", dom.window.document, dom.window.location, { limit: 5 });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].externalJobId, "1700000001");
  assert.equal(jobs[0].salaryText, "₹ 8,000 /month");
  assert.equal(jobs[0].sourceUrl, "https://internshala.com/internship/detail/python-internship-at-acme1700000001");
});

test("mergeDetail fills description, salary and skills without overwriting list data", () => {
  const { mergeDetail } = require("../../services/jobBoards/scrapePlatform");
  const out = mergeDetail({ title: "T", company: "C", location: "", salaryText: null, skills: [], description: "" }, { role: "x", company: "y", location: "Pune", descriptionStructured: "Do things", description: "Do things", salaryText: "5 LPA", skills: ["Go"] });
  assert.equal(out.title, "T");
  assert.equal(out.company, "C");
  assert.equal(out.location, "Pune");
  assert.equal(out.description, "Do things");
  assert.equal(out.salaryText, "5 LPA");
  assert.deepEqual(out.skills, ["Go"]);
  assert.equal(mergeDetail({ title: "T" }, null).title, "T");
});
