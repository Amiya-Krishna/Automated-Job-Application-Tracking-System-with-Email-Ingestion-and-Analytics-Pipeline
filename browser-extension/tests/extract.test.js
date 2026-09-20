import test from "node:test";
import assert from "node:assert/strict";
import { loadPage, LINKEDIN_HTML, INDEED_HTML, TITLE_ONLY_HTML, LI_URL, IN_URL } from "./helpers.js";

// objects created inside jsdom have a different Object prototype; compare plain JSON
const plain = (o) => JSON.parse(JSON.stringify(o));
const detect = (html, url) => {
  const dom = loadPage(html, url);
  return { d: dom.window.TrackTrailExtract.detectJob(dom.window.document, dom.window.location), X: dom.window.TrackTrailExtract, dom };
};

test("LinkedIn: title, company, location, canonical URL and job id are extracted", () => {
  const { d } = detect(LINKEDIN_HTML, LI_URL);
  assert.equal(d.role, "Software Engineer Intern");
  assert.equal(d.company, "Acme Corp");
  assert.equal(d.location, "Bengaluru, Karnataka, India");
  assert.equal(d.externalJobId, "3912345678");
  assert.equal(d.sourceUrl, "https://www.linkedin.com/jobs/view/3912345678/"); // tracking params stripped
  assert.equal(d.sourceName, "linkedin");
});

test("JD structure (headings + bullets) survives extraction; the flat text is unchanged for Save Job", () => {
  const { d } = detect(LINKEDIN_HTML, LI_URL);
  const lines = d.descriptionStructured.split("\n");
  assert.ok(lines.includes("Requirements"));
  assert.ok(lines.includes("Preferred qualifications"));
  assert.ok(lines.includes("- Experience with React and JavaScript"));
  assert.ok(lines.includes("- Familiarity with Node.js"));
  // legacy field used by the existing Save button keeps its collapsed single-line form
  assert.ok(!d.description.includes("\n"));
  assert.match(d.description, /About the role Build web features/);
});

test("hidden text and scripts are NOT treated as the visible job description", () => {
  const { d } = detect(LINKEDIN_HTML, LI_URL);
  assert.doesNotMatch(d.descriptionStructured, /HIDDEN|AWS|window\.evil/);
});

test("Indeed: fields, <br>-separated structure and canonical URL", () => {
  const { d } = detect(INDEED_HTML, IN_URL);
  assert.equal(d.role, "Backend Developer");
  assert.equal(d.company, "Globex");
  assert.equal(d.externalJobId, "abcdef0123456789");
  assert.equal(d.sourceUrl, "https://www.indeed.com/viewjob?jk=abcdef0123456789");
  assert.deepEqual(d.descriptionStructured.split("\n"), ["We build APIs.", "Requirements:", "Python and SQL", "Nice to have: Kafka"]);
});

test("falls back to <title> when the DOM classes are unrecognised, and never invents a description", () => {
  const { d } = detect(TITLE_ONLY_HTML, "https://www.linkedin.com/jobs/collections/recommended/");
  assert.equal(d.role, "Data Analyst");
  assert.equal(d.company, "Initech");
  assert.equal(d.description, "");
  assert.equal(d.descriptionStructured, "");
});

test("unsupported hosts report only what is on the page", () => {
  const { d } = detect("<html><body><h1>Whatever</h1></body></html>", "https://careers.example.com/job/1");
  assert.deepEqual([d.role, d.company, d.description, d.sourceName], ["", "", "", "extension"]);
});

test("toApiJob normalises to exactly the fields the API accepts; empty stays empty", () => {
  const { d, X } = detect(LINKEDIN_HTML, LI_URL);
  const job = plain(X.toApiJob(d));
  assert.deepEqual(Object.keys(job).sort(), ["company", "description", "externalJobId", "location", "sourceName", "sourceUrl", "title"]);
  assert.equal(job.title, "Software Engineer Intern");
  assert.match(job.description, /\n- Familiarity with Node\.js/); // structured text is what gets analysed
  const empty = X.toApiJob({ role: "", company: "", location: "", description: "", descriptionStructured: "", externalJobId: "", sourceUrl: "", sourceName: "" });
  assert.deepEqual(plain(empty), { title: "", company: "", location: null, description: "", sourceUrl: null, sourceName: "extension", externalJobId: null });
});

test("toSaveJob is byte-for-byte the payload the original Save button sent", () => {
  const { d, X } = detect(LINKEDIN_HTML, LI_URL);
  assert.deepEqual(plain(X.toSaveJob(d, "www.linkedin.com")), {
    company: "Acme Corp", role: "Software Engineer Intern", status: "Applied", notes: "Saved from www.linkedin.com",
    location: "Bengaluru, Karnataka, India", description: d.description, sourceName: "linkedin",
    sourceUrl: "https://www.linkedin.com/jobs/view/3912345678/", externalJobId: "3912345678",
  });
  assert.equal(X.toSaveJob({ sourceName: "x", sourceUrl: "u" }, "h").company, "Unknown company");
});
