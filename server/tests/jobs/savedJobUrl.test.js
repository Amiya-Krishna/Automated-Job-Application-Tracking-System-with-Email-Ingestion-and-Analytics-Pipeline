// POST /api/jobs: the posting URL persists, is cleaned, bad values never fail the save,
// and a repeat save of the same posting updates the existing row instead of duplicating it.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-secret";
const rows = [];
let nextId = 1;
const match = (r, w) => Object.entries(w).every(([k, v]) => (v && typeof v === "object" && "equals" in v ? String(r[k]).toLowerCase() === String(v.equals).toLowerCase() : r[k] === v));
const stub = (rel, exports) => { const id = require.resolve(path.join("..", "..", rel)); require.cache[id] = { id, filename: id, loaded: true, exports }; };
stub("lib/prisma", {
  trackedJob: {
    findFirst: async ({ where }) => rows.find((r) => match(r, where)) || null,
    create: async ({ data }) => { const r = { id: nextId++, ...data }; rows.push(r); return r; },
    update: async ({ where, data }) => Object.assign(rows.find((r) => r.id === where.id), data),
  },
});
stub("services/engineBridge", { bridgeTrackedJobToEngine: async () => {} });
stub("services/appliedJobsService", { getAppliedJobsForUser: async () => [] });
const express = require("express");
const app = express();
app.use(express.json());
app.use("/api/jobs", require("../../routes/jobRoutes"));
let server, base;
test.before(async () => { server = http.createServer(app); await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const post = (body, uid = 1) => fetch(`${base}/api/jobs`, { method: "POST", headers: { "Content-Type": "application/json", token: jwt.sign({ id: uid, typ: "access" }, "test-secret") }, body: JSON.stringify(body) });

test("the extension's canonical posting URL, salary and skills are persisted", async () => {
  const r = await post({ company: "Initech", role: "Data Engineer", sourceName: "naukri", externalJobId: "99", sourceUrl: "https://www.naukri.com/job-listings-x-99?utm_source=a&trk=b#frag", salaryText: "12-18 Lacs PA", skills: ["Spark", "Spark", " SQL "] });
  assert.equal(r.status, 201);
  const j = await r.json();
  assert.equal(j.sourceUrl, "https://www.naukri.com/job-listings-x-99", "tracking params + fragment stripped");
  assert.equal(j.salaryText, "12-18 Lacs PA");
  assert.deepEqual(j.skills, ["Spark", "SQL"]);
  assert.equal(j.duplicate, false);
});

test("duplicate save (same source + id) returns 200 duplicate:true, keeps ONE row and fills in newly captured details", async () => {
  const before = rows.length;
  const r = await post({ company: "Initech", role: "Data Engineer", sourceName: "naukri", externalJobId: "99", sourceUrl: "https://www.naukri.com/job-listings-x-99", description: "now with description", location: "Hyderabad" });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.duplicate, true);
  assert.equal(rows.length, before);
  assert.equal(j.description, "now with description");
  assert.equal(j.location, "Hyderabad");
  assert.equal(j.salaryText, "12-18 Lacs PA", "existing details are not wiped");
});

test("duplicate detected by URL alone, and per user (another user can save the same posting)", async () => {
  const r = await post({ company: "Other", role: "Other", sourceUrl: "https://www.naukri.com/job-listings-x-99" });
  assert.equal((await r.json()).duplicate, true);
  const other = await post({ company: "Initech", role: "Data Engineer", sourceName: "naukri", externalJobId: "99", sourceUrl: "https://www.naukri.com/job-listings-x-99" }, 2);
  assert.equal(other.status, 201);
});

test("invalid / missing / hostile / over-long URLs never fail the save: the job is stored without a link", async () => {
  const bad = ["javascript:alert(1)", "internal://x", "not a url", "ftp://x.com/a", "https://user:pw@evil.com/a", "https://localhost/x"];
  let i = 0;
  for (const u of bad) {
    const r = await post({ company: "C" + i, role: "R" + i, sourceUrl: u });
    assert.equal(r.status, 201, u.slice(0, 30));
    assert.equal((await r.json()).sourceUrl, null, u.slice(0, 30));
    i += 1;
  }
  const none = await post({ company: "NoUrl", role: "NoUrl" });
  assert.equal(none.status, 201);
  assert.equal((await none.json()).sourceUrl, null);
});

test("an over-long URL is shortened (query dropped), never rejected", async () => {
  const r = await post({ company: "Long", role: "Long", sourceUrl: "https://example.com/jobs/1?" + "q=1&".repeat(400) });
  assert.equal(r.status, 201);
  assert.equal((await r.json()).sourceUrl, "https://example.com/jobs/1");
});

test("Indeed canonical URL keeps the country host and the jk id only", async () => {
  const r = await post({ company: "G", role: "Dev", sourceName: "indeed", externalJobId: "0123456789abcdef", sourceUrl: "https://in.indeed.com/viewjob?jk=0123456789abcdef&utm_source=x&trk=y" });
  assert.equal((await r.json()).sourceUrl, "https://in.indeed.com/viewjob?jk=0123456789abcdef");
});
