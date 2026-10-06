// User A / User B / Admin against the REAL routers + middleware (in-memory Prisma that really
// evaluates the filters). Covers the ten ownership scenarios plus ID-guessing (IDOR) attempts.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const { makeDb } = require("./fakePrisma");

process.env.JWT_SECRET = "test-secret";
const stub = (rel, exports) => { const id = require.resolve(path.join("..", "..", rel)); require.cache[id] = { id, filename: id, loaded: true, exports }; };

const db = makeDb({
  companies: { jobs: { table: "jobs", fk: "company_id" } },
  jobs: { $companies: { table: "companies", fk: "company_id" }, $job_sources: { table: "job_sources", fk: "source_id" }, match_scores: { table: "match_scores", fk: "job_id" } },
});
const A = 1, B = 2, ADMIN = 3;
db.seed("user", [{ id: A, role: "user", status: "ACTIVE" }, { id: B, role: "user", status: "ACTIVE" }, { id: ADMIN, role: "admin", status: "ACTIVE" }]);
const SRC = {}; // name -> id
const GLOBAL = ["linkedin", "naukri", "remotive", "unstop", "indeed", "wellfound", "internshala"], PRIVATE = ["manual", "gmail", "extension"];
db.seed("job_sources", [...PRIVATE.map((name) => ({ name, scope: "private", base_url: null })), ...GLOBAL.map((name) => ({ name, scope: "global", base_url: `https://${name}.example` }))]);
db.T.job_sources.forEach((s) => { SRC[s.name] = s.id; });
db.seed("companies", [
  { name: "Globex", normalized_name: "globex" },       // 1: global job
  { name: "SecretA Inc", normalized_name: "secreta inc" }, // 2: only A's private job
  { name: "SecretB Inc", normalized_name: "secretb inc" }, // 3: only B's private job
  { name: "Shared Co", normalized_name: "shared co" },  // 4: global job AND A's private job
]);
const J = (id, company_id, title, source, owner = null, status = "new") => ({ id, company_id, title, source_id: SRC[source], owner_user_id: owner, status, scraped_at: new Date(2026, 0, id), description: "d", source_url: "http://x", location: null, remote_type: null, posted_at: null, external_job_id: null });
db.seed("jobs", [
  J(1, 1, "Global Dev", "linkedin"),
  J(2, 2, "A private (gmail)", "gmail", A),
  J(3, 3, "B private (manual)", "manual", B),
  J(4, 4, "Shared global", "naukri"),
  J(5, 4, "A private at shared", "extension", A),
  J(6, 1, "Global dupe", "linkedin", null, "duplicate"),
]);
db.seed("trackedJob", [
  { userId: A, company: "SecretA Inc", role: "r", sourceName: "gmail", engineJobId: 2 },
  { userId: A, company: "Hand typed Co", role: "r", sourceName: "manual", engineJobId: null },
  { userId: B, company: "SecretB Inc", role: "r", sourceName: "manual", engineJobId: null },
  { userId: B, company: "Globex", role: "r", sourceName: "linkedin", engineJobId: 1 }, // applied from the catalog
]);
db.seed("user_profile", []); db.seed("match_scores", []); db.seed("applications", []);

const fakeQuery = async (sql, params) => {
  if (/INSERT INTO companies/.test(sql)) {
    let c = db.T.companies.find((x) => x.normalized_name === params[1]);
    if (!c) c = await db.model("companies").create({ data: { name: params[0], normalized_name: params[1] } });
    return { rows: [{ id: c.id }] };
  }
  throw new Error(`unexpected SQL ${sql}`);
};
const m = (n) => db.model(n);
const prisma = {
  user: m("user"), jobs: m("jobs"), job_sources: m("job_sources"), companies: m("companies"), trackedJob: m("trackedJob"),
  user_profile: { findUnique: async () => null }, match_scores: m("match_scores"), applications: { upsert: async () => ({}) },
  notification: m("notification"), pushDevice: m("pushDevice"), notificationPreference: m("notificationPreference"),
  query: fakeQuery,
};
const ingested = [];
stub("lib/prisma", Object.assign(prisma, { query: fakeQuery }));
stub("queue", { ingestQueue: { add: async (n, payload) => ingested.push(payload) }, applyQueue: { add: async () => ({}) }, analyticsQueue: { add: async () => ({}) } });
stub("services/learningService", { updateWeightsFromOutcome: async () => {} });
stub("services/appliedJobsService", { getAppliedJobsForUser: async () => [] });
const Module = require("module");
const origLoad = Module._load;
Module._load = function (req, ...rest) { return req === "@prisma/client" ? { Prisma: {}, PrismaClient: class {} } : origLoad.call(this, req, ...rest); };

const express = require("express");
const auth = require("../../middleware/authMiddleware");
const app = express();
app.use(express.json());
app.use("/api/engine/jobs", auth, require("../../routes/engineJobsRoutes"));
app.use("/api/companies", auth, require("../../routes/companiesRoutes"));
app.use("/api/sources", auth, require("../../routes/sourcesRoutes"));
app.use("/api/ingest", auth, require("../../routes/ingestRoutes"));
app.use("/api/jobs", require("../../routes/jobRoutes"));
app.use("/api/applications", auth, require("../../routes/applyRoutes"));
app.use("/api/notifications", require("../../routes/notificationRoutes"));

let server, base;
test.before(async () => { server = http.createServer(app); await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const tok = (id, extra = {}) => jwt.sign({ id, typ: "access", ...extra }, "test-secret");
const call = (method, p, id, body) => fetch(base + p, { method, headers: { "Content-Type": "application/json", ...(id ? { token: tok(id) } : {}) }, body: body ? JSON.stringify(body) : undefined });
const get = async (p, id) => { const r = await call("GET", p, id); return { status: r.status, body: await r.json().catch(() => null) }; };
const titles = (r) => r.body.data.map((j) => j.title).sort();

test("1-3. private jobs are visible only to their owner; global jobs to everyone (list)", async () => {
  const a = await get("/api/engine/jobs", A), b = await get("/api/engine/jobs", B), adm = await get("/api/engine/jobs", ADMIN);
  assert.deepEqual(titles(a), ["A private (gmail)", "A private at shared", "Global Dev", "Shared global"]);
  assert.deepEqual(titles(b), ["B private (manual)", "Global Dev", "Shared global"]);
  assert.deepEqual(titles(adm), ["Global Dev", "Shared global"], "admin sees global jobs, never users' private ones");
  assert.ok(!titles(a).includes("B private (manual)") && !titles(b).includes("A private (gmail)"));
  assert.ok(![...titles(a), ...titles(b)].includes("Global dupe"), "inert duplicate rows are never listed");
});

test("10a. job ids: another user's private job is a plain 404 (detail and apply)", async () => {
  assert.equal((await get("/api/engine/jobs/2", A)).status, 200);
  for (const id of [B, ADMIN]) assert.equal((await get("/api/engine/jobs/2", id)).status, 404, `user ${id} reading A's job`);
  assert.equal((await get("/api/engine/jobs/3", A)).status, 404);
  assert.equal((await get("/api/engine/jobs/1", B)).status, 200, "global job readable by all");
  assert.equal((await get("/api/engine/jobs/abc", A)).status, 404);
  assert.equal((await call("POST", "/api/applications/2", B)).status, 404, "B cannot apply to A's private job");
  assert.equal(db.T.trackedJob.filter((t) => t.userId === B && t.engineJobId === 2).length, 0);
  assert.equal((await call("POST", "/api/applications/2", A)).status, 202, "owner can");
});

test("8-9. companies: via global jobs or own jobs only; counts, search and detail follow", async () => {
  const names = async (id, q = "") => (await get(`/api/companies${q}`, id)).body.data.map((c) => c.name).sort();
  assert.deepEqual(await names(B), ["Globex", "SecretB Inc", "Shared Co"], "B: global companies + own; never SecretA");
  assert.ok((await names(A)).includes("SecretA Inc") && !(await names(A)).includes("SecretB Inc"));
  assert.deepEqual(await names(ADMIN), ["Globex", "Shared Co"], "admin-fetched companies visible; users' private-only ones are not");
  assert.deepEqual(await names(B, "?search=secreta"), [], "search cannot reach it either");
  assert.equal((await get("/api/companies/2", B)).status, 404, "company only reachable via A's private job");
  assert.equal((await get("/api/companies/2", A)).status, 200);
  assert.equal((await get("/api/companies/1", B)).status, 200, "admin-fetched company is visible to all");
  // Shared Co has a global job and A's private job: B sees it, but only the global job counts/lists
  const shared = (await get("/api/companies", B)).body.data.find((c) => c.name === "Shared Co");
  assert.equal(shared.jobCount, 1);
  assert.equal((await get("/api/companies", A)).body.data.find((c) => c.name === "Shared Co").jobCount, 2);
  const det = (await get("/api/companies/4", B)).body.data.jobs.map((j) => j.title);
  assert.deepEqual(det, ["Shared global"]);
});

test("6-7. sources: users get Manual/Gmail/Extension with their own counts; admin gets the 7 fetched sources", async () => {
  const a = await get("/api/sources", A), b = await get("/api/sources", B), adm = await get("/api/sources", ADMIN);
  assert.deepEqual(a.body.data.map((s) => s.name).sort(), ["extension", "gmail", "manual"]);
  assert.deepEqual(adm.body.data.map((s) => s.name).sort(), [...GLOBAL].sort());
  const count = (r, n) => r.body.data.find((s) => s.name === n).jobCount;
  assert.equal(count(a, "gmail"), 1); assert.equal(count(a, "manual"), 1); assert.equal(count(b, "gmail"), 0); assert.equal(count(b, "manual"), 1);
  assert.equal(count(adm, "linkedin"), 1, "global jobs only (duplicate row excluded)");
  assert.ok(adm.body.data.every((s) => s.scope === "global") && a.body.data.every((s) => s.scope === "private"));
  assert.ok(a.body.data.every((s) => s.baseUrl === null));
});

test("10b. source ids: the other audience's sources and other users' data are unreachable", async () => {
  const gmailId = SRC.gmail, linkedinId = SRC.linkedin;
  assert.equal((await get(`/api/sources/${linkedinId}`, A)).status, 404, "user cannot open a fetched source");
  assert.equal((await get(`/api/sources/${gmailId}`, ADMIN)).status, 404, "admin cannot open a private source");
  const mineA = await get(`/api/sources/${gmailId}`, A), mineB = await get(`/api/sources/${gmailId}`, B);
  assert.deepEqual(mineA.body.data.trackedJobs.map((t) => t.company), ["SecretA Inc"]);
  assert.deepEqual(mineB.body.data.trackedJobs, []);
  const adminView = await get(`/api/sources/${linkedinId}`, ADMIN);
  assert.deepEqual(adminView.body.data.jobs.map((j) => j.title), ["Global Dev"]);
  assert.ok(!JSON.stringify(adminView.body).includes("private"));
  assert.equal((await get("/api/sources")).status, 401);
});

test("saving a job: origin is decided by the server; the website name is only the platform", async () => {
  const r = await call("POST", "/api/jobs", A, { company: "Initrode", role: "Dev", sourceName: "linkedin", sourceUrl: "https://www.linkedin.com/jobs/view/1", description: "desc" });
  assert.equal(r.status, 201);
  const row = db.T.trackedJob.find((t) => t.company === "Initrode");
  assert.deepEqual([row.userId, row.sourceName, row.platform], [A, "extension", "linkedin"]);
  const payload = ingested.at(-1);
  assert.deepEqual([payload.sourceName, payload.ownerUserId], ["extension", A], "bridged as A's private extension job");
  // user spoofing a body userId or a global source cannot create global/foreign data
  await call("POST", "/api/jobs", B, { company: "Spoof", role: "Dev", userId: A, sourceName: "internshala", description: "x" });
  const spoof = db.T.trackedJob.find((t) => t.company === "Spoof");
  assert.equal(spoof.userId, B); assert.equal(spoof.sourceName, "extension");
  assert.equal(ingested.at(-1).ownerUserId, B);
  // the company exists once for everyone but is invisible to B until a visible job exists
  assert.equal((await get("/api/companies", ADMIN)).body.data.some((c) => c.name === "Initrode"), false);
  assert.equal((await get("/api/companies", B)).body.data.some((c) => c.name === "Initrode"), false);
  assert.equal((await get("/api/companies", A)).body.data.some((c) => c.name === "Initrode"), true);
  // catalog-applied rows are never copied into a second private engine row
  ingested.length = 0;
  const applied = db.T.trackedJob.find((t) => t.userId === B && t.engineJobId === 1);
  const { bridgeTrackedJobToEngine } = require("../../services/engineBridge");
  assert.equal(await bridgeTrackedJobToEngine({ ...applied, description: "d" }), null);
  assert.equal(ingested.length, 0);
});

test("4-5. notifications: strictly per user - list, unread count, read, read-all, delete", async () => {
  const svc = require("../../services/notificationService");
  const n1 = await svc.createNotification(A, { kind: "interview", title: "A: interview tomorrow", dedupeKey: "k1" });
  const n2 = await svc.createNotification(B, { kind: "job", title: "B: new match", dedupeKey: "k1" }); // same key, different user: fine
  assert.ok(n1 && n2);
  assert.equal(await svc.createNotification(A, { title: "dup", dedupeKey: "k1" }), null, "dedupe is per user");
  await assert.rejects(svc.createNotification(undefined, { title: "x" }), /valid user id/);

  const la = await get("/api/notifications/inbox", A), lb = await get("/api/notifications/inbox", B), lc = await get("/api/notifications/inbox", ADMIN);
  assert.deepEqual(la.body.data.map((n) => n.title), ["A: interview tomorrow"]);
  assert.deepEqual(lb.body.data.map((n) => n.title), ["B: new match"]);
  assert.deepEqual(lc.body.data, [], "admin has no access to other users' notifications");
  assert.equal(la.body.unreadCount, 1); assert.equal(lb.body.unreadCount, 1); assert.equal(lc.body.unreadCount, 0);

  // IDOR: B cannot read/delete A's notification by id
  assert.equal((await call("POST", `/api/notifications/inbox/${n1.id}/read`, B)).status, 404);
  assert.equal((await call("DELETE", `/api/notifications/inbox/${n1.id}`, B)).status, 404);
  assert.equal((await get("/api/notifications/inbox/unread-count", A)).body.unreadCount, 1, "A's state untouched");
  // B's read-all / clear cannot touch A
  assert.equal((await call("POST", "/api/notifications/inbox/read-all", B)).status, 200);
  assert.equal((await get("/api/notifications/inbox/unread-count", B)).body.unreadCount, 0);
  assert.equal((await get("/api/notifications/inbox/unread-count", A)).body.unreadCount, 1);
  const ra = await call("POST", `/api/notifications/inbox/${n1.id}/read`, A);
  assert.equal((await ra.json()).unreadCount, 0);
  assert.equal((await call("DELETE", "/api/notifications/inbox", B)).status, 200);
  assert.equal((await get("/api/notifications/inbox", A)).body.data.length, 1, "B clearing their inbox leaves A's intact");
  assert.equal((await call("DELETE", `/api/notifications/inbox/${n1.id}`, A)).status, 200);
  assert.equal((await get("/api/notifications/inbox", A)).body.data.length, 0);
  assert.equal((await get("/api/notifications/inbox")).status, 401);
});

test("4-5b. client-recorded notifications are always created for the caller only", async () => {
  const r = await call("POST", "/api/notifications/inbox", A, { kind: "application", title: "Application submitted", body: "Dev at X", target: { to: "/edit-job/9" }, userId: B });
  assert.equal(r.status, 201);
  assert.equal((await get("/api/notifications/inbox", B)).body.data.length, 0, "a forged userId in the body is ignored");
  const mine = (await get("/api/notifications/inbox", A)).body;
  assert.deepEqual(mine.data.map((n) => [n.title, n.target.to, n.kind]), [["Application submitted", "/edit-job/9", "application"]]);
  assert.equal((await call("POST", "/api/notifications/inbox", A, { body: "no title" })).status, 400);
  assert.equal((await call("POST", "/api/notifications/inbox", A, { title: "x", target: "javascript:alert(1)" })).status, 400);
});

test("/api/ingest can never create a global job: the source is forced private and the owner is the caller", async () => {
  ingested.length = 0;
  for (const [id, sourceName] of [[A, "linkedin"], [B, "remotive"], [A, "gmail"], [B, "totally-unknown"]]) {
    const r = await call("POST", "/api/ingest", id, { title: "T", company: "C", description: "d", sourceName, sourceUrl: "http://x/1", ownerUserId: ADMIN, owner_user_id: null });
    assert.equal(r.status, 202, sourceName);
    const payload = ingested.at(-1);
    assert.ok(["extension", "gmail"].includes(payload.sourceName), `${sourceName} -> ${payload.sourceName}`);
    assert.equal(payload.ownerUserId, id, "owner is the authenticated caller, never a body value");
  }
  assert.equal((await call("POST", "/api/ingest", null, { title: "T" })).status, 401);
});
