// Drives the REAL middleware + admin/scrape routers over HTTP with an in-memory Prisma.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-secret";
const db = {
  users: [
    { id: 1, name: "Admin", email: "a@x.co", role: "admin" },
    { id: 2, name: "User", email: "u@x.co", role: "user" },
  ],
  deleted: [],
};
const stub = (rel, exports) => { const id = require.resolve(path.join("..", "..", rel)); require.cache[id] = { id, filename: id, loaded: true, exports }; };
const tx = {
  applications: { count: async () => 0 },
  jobs: {
    // admin deletion only ever sees GLOBAL jobs (owner_user_id: null)
    findFirst: async ({ where }) => (where.id === 5n && where.owner_user_id === null ? { id: 5n } : null),
    count: async () => 0,
    findMany: async () => [],
    updateMany: async () => ({ count: 1 }),
    deleteMany: async ({ where }) => { db.deleted.push(...where.id.in.map(String)); return { count: where.id.in.length }; },
  },
  trackedJob: { updateMany: async () => ({ count: 0 }) },
  companies: {
    findUnique: async ({ where }) => (where.id === 1 ? { id: 1 } : null),
    delete: async () => ({}),
  },
  job_sources: { findFirst: async ({ where }) => (where.id === 1 && where.scope === "global" ? { id: 1, name: "naukri" } : null), delete: async () => ({}) },
};
const jobsByCompany = { 1: [{ id: 9n }] };
tx.jobs.findMany = async ({ where }) => (where.company_id ? jobsByCompany[where.company_id] || [] : where.source_id ? [] : []);
const prisma = {
  user: {
    findUnique: async ({ where }) => db.users.find((u) => u.id === where.id) || null,
    findMany: async () => db.users,
    count: async () => db.users.length,
    update: async ({ where, data }) => Object.assign(db.users.find((u) => u.id === where.id), data),
  },
  jobs: { count: async () => 0 }, companies: { count: async () => 0 }, job_sources: { count: async () => 0 }, scrapeRun: { count: async () => 0 },
  $transaction: async (fn) => fn(tx),
};
stub("lib/prisma", prisma);
stub("queue", { scrapeQueue: { add: async () => ({ id: 1 }) } });
stub("services/rateLimiter", { allowAction: async () => true });
stub("services/jobDiscovery", { ADAPTERS: { naukri: {}, internshala: {}, wellfound: {}, unstop: {}, linkedin: {}, indeed: {}, remotive: {} } });

const express = require("express");
const auth = require("../../middleware/authMiddleware");
const requireAdmin = require("../../middleware/requireAdmin");
const app = express();
app.use(express.json());
app.use("/api/admin", auth, requireAdmin, require("../../routes/adminRoutes"));
app.use("/api/scrape", auth, requireAdmin, require("../../routes/scrapeRoutes"));
app.get("/api/open", auth, (req, res) => res.json({ ok: true }));

let server, base;
test.before(async () => { server = http.createServer(app); await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const tok = (id) => jwt.sign({ id, typ: "access" }, "test-secret");
const call = (method, p, token, body) => fetch(base + p, { method, headers: { "Content-Type": "application/json", ...(token ? { token } : {}) }, body: body && !["GET","HEAD"].includes(method) ? JSON.stringify(body) : undefined });

test("no token -> 401; normal user -> 403 on every admin and discovery route", async () => {
  const routes = [["GET", "/api/admin/overview"], ["GET", "/api/admin/users"], ["DELETE", "/api/admin/jobs/5"], ["DELETE", "/api/admin/companies/1"], ["DELETE", "/api/admin/sources/1"],
    ["PATCH", "/api/admin/users/2/role"], ["POST", "/api/scrape/run"], ["GET", "/api/scrape/runs"], ["GET", "/api/scrape/platforms"], ["DELETE", "/api/scrape/runs/1"]];
  for (const [m, p] of routes) {
    assert.equal((await call(m, p, null, {})).status, 401, `${m} ${p} anon`);
    const r = await call(m, p, tok(2), { role: "admin", query: "x" });
    assert.equal(r.status, 403, `${m} ${p} user`);
    assert.equal((await r.json()).code, "admin_required");
  }
  assert.equal(db.users[1].role, "user");
  assert.deepEqual(db.deleted, []);
});

test("a forged role claim in the token does not grant access (role is read from the database)", async () => {
  const forged = jwt.sign({ id: 2, typ: "access", role: "admin" }, "test-secret");
  assert.equal((await call("GET", "/api/admin/overview", forged)).status, 403);
});

test("demotion takes effect immediately for already-issued tokens", async () => {
  db.users.push({ id: 3, name: "Temp", email: "t@x.co", role: "admin" });
  const t = tok(3);
  assert.equal((await call("GET", "/api/admin/overview", t)).status, 200);
  db.users.find((u) => u.id === 3).role = "user";
  assert.equal((await call("GET", "/api/admin/overview", t)).status, 403);
});

test("admin can read discovery platforms (all six + remotive) and delete a job", async () => {
  const p = await (await call("GET", "/api/scrape/platforms", tok(1))).json();
  for (const n of ["linkedin", "indeed", "naukri", "internshala", "wellfound", "unstop"]) assert.ok(p.data.includes(n), n);
  const d = await call("DELETE", "/api/admin/jobs/5", tok(1));
  assert.equal(d.status, 200);
  assert.deepEqual(db.deleted, ["5"]);
  assert.equal((await call("DELETE", "/api/admin/jobs/6", tok(1))).status, 404);
  assert.equal((await call("DELETE", "/api/admin/jobs/abc", tok(1))).status, 400);
});

test("company with jobs is refused (409) unless withJobs=true; source without jobs deletes", async () => {
  const refused = await call("DELETE", "/api/admin/companies/1", tok(1));
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).code, "has_jobs");
  assert.equal((await call("DELETE", "/api/admin/companies/1?withJobs=true", tok(1))).status, 200);
  assert.equal((await call("DELETE", "/api/admin/sources/1", tok(1))).status, 200);
  assert.equal((await call("DELETE", "/api/admin/sources/99", tok(1))).status, 404);
});

test("role management: valid values only, cannot change own role", async () => {
  assert.equal((await call("PATCH", "/api/admin/users/2/role", tok(1), { role: "root" })).status, 400);
  assert.equal((await call("PATCH", "/api/admin/users/1/role", tok(1), { role: "user" })).status, 400);
  const ok = await call("PATCH", "/api/admin/users/2/role", tok(1), { role: "admin" });
  assert.equal(ok.status, 200);
  assert.equal(db.users[1].role, "admin");
  const list = await (await call("GET", "/api/admin/users", tok(1))).json();
  assert.ok(list.data.every((u) => !("password" in u)));
});

test("promotion takes effect immediately: the same user token gains access after being made admin", async () => {
  db.users.push({ id: 4, name: "Soon", email: "s@x.co", role: "user" });
  const t = tok(4);
  assert.equal((await call("GET", "/api/admin/overview", t)).status, 403);
  assert.equal((await call("PATCH", "/api/admin/users/4/role", tok(1), { role: "admin" })).status, 200);
  assert.equal((await call("GET", "/api/admin/overview", t)).status, 200);
  assert.equal((await call("PATCH", "/api/admin/users/4/role", tok(1), { role: "user" })).status, 200);
  assert.equal((await call("GET", "/api/admin/overview", t)).status, 403);
});

test("a normal user can never promote themselves (own id, someone else's id, bad body)", async () => {
  const u = tok(2); // user 2 is promoted by an earlier test; demote first so this runs as a normal user
  db.users.find((x) => x.id === 2).role = "user";
  for (const id of [2, 1, 4]) assert.equal((await call("PATCH", `/api/admin/users/${id}/role`, u, { role: "admin" })).status, 403);
  assert.equal(db.users.find((x) => x.id === 2).role, "user");
});
