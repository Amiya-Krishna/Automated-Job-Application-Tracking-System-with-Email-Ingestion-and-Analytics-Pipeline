// Admin bootstrap (ADMIN_EMAILS / make-admin), no self-promotion via registration,
// and proof that the REAL server.js puts requireAdmin on /api/scrape and /api/admin.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..", "..");
const stubPath = (rel) => require.resolve(path.join(root, rel));
const stub = (rel, exports) => { const id = stubPath(rel); require.cache[id] = { id, filename: id, loaded: true, exports }; };

test("server.js mounts requireAdmin (after auth) on /api/scrape and /api/admin, and nowhere is discovery mounted without it", () => {
  const src = fs.readFileSync(path.join(root, "server.js"), "utf8");
  assert.match(src, /app\.use\("\/api\/scrape",\s*auth,\s*requireAdmin,\s*require\("\.\/routes\/scrapeRoutes"\)\)/);
  assert.match(src, /app\.use\("\/api\/admin",\s*auth,\s*requireAdmin,\s*require\("\.\/routes\/adminRoutes"\)\)/);
  assert.equal((src.match(/scrapeRoutes/g) || []).length, 1, "scrapeRoutes mounted exactly once");
  assert.equal((src.match(/adminRoutes/g) || []).length, 1, "adminRoutes mounted exactly once");
});

test("no non-admin router exposes catalog deletes (companies / sources / engine jobs have no DELETE)", () => {
  for (const f of ["companiesRoutes", "sourcesRoutes", "engineJobsRoutes", "ingestRoutes"]) {
    const src = fs.readFileSync(path.join(root, "routes", f + ".js"), "utf8");
    assert.doesNotMatch(src, /router\.(delete|put|patch)\(/, `${f} must be read-only`);
  }
});

test("parseAdminEmails: trims, lowercases, drops invalid, empty when unset", () => {
  stub("lib/prisma", {});
  const { parseAdminEmails } = require("../../services/adminBootstrap");
  assert.deepEqual(parseAdminEmails(" A@X.com, b@y.org ,not-an-email,, "), ["a@x.com", "b@y.org"]);
  assert.deepEqual(parseAdminEmails(""), []);
  assert.deepEqual(parseAdminEmails(undefined), []);
});

test("ensureAdmins promotes only EXISTING listed accounts, never demotes, never creates; no-op when unset", async () => {
  stub("lib/prisma", {});
  const { ensureAdmins } = require("../../services/adminBootstrap");
  const users = [{ id: 1, email: "Boss@X.com", role: "user" }, { id: 2, email: "other@x.com", role: "user" }, { id: 3, email: "old@x.com", role: "admin" }];
  const db = {
    user: {
      findMany: async ({ where }) => users.filter((u) => where.email.in.includes(u.email.toLowerCase())).map((u) => ({ id: u.id, email: u.email, role: u.role })),
      updateMany: async ({ where, data }) => { let n = 0; for (const u of users) if (where.id.in.includes(u.id)) { u.role = data.role; n++; } return { count: n }; },
      create: async () => { throw new Error("must not create accounts"); },
    },
  };
  const log = { log() {}, error() {} };
  delete process.env.ADMIN_EMAILS;
  assert.deepEqual(await ensureAdmins(db, log), { promoted: 0 });
  assert.deepEqual(users.map((u) => u.role), ["user", "user", "admin"], "no ADMIN_EMAILS -> nobody promoted (and the existing admin is NOT demoted)");
  process.env.ADMIN_EMAILS = "boss@x.com,ghost@x.com";
  assert.deepEqual(await ensureAdmins(db, log), { promoted: 1 });
  assert.deepEqual(users.map((u) => u.role), ["admin", "user", "admin"]);
  delete process.env.ADMIN_EMAILS;
});

test("ensureAdmins refuses to promote when an admin address also matches a case-variant account", async () => {
  const { ensureAdmins } = require("../../services/adminBootstrap");
  const users = [{ id: 1, email: "boss@x.com", role: "user" }, { id: 2, email: "Boss@X.com", role: "user" }];
  const db = {
    user: {
      findMany: async ({ where }) => users.filter((u) => where.email.in.includes(u.email.toLowerCase())).map((u) => ({ ...u })),
      updateMany: async () => { throw new Error("must not promote an ambiguous address"); },
    },
  };
  const errs = [];
  process.env.ADMIN_EMAILS = "boss@x.com";
  assert.deepEqual(await ensureAdmins(db, { log() {}, error: (m) => errs.push(m) }), { promoted: 0 });
  assert.match(errs[0], /differing only by letter case/);
  delete process.env.ADMIN_EMAILS;
});

test("ensureAdmins fails soft (boot continues) if the role column does not exist yet", async () => {
  const { ensureAdmins } = require("../../services/adminBootstrap");
  process.env.ADMIN_EMAILS = "a@x.com";
  const errs = [];
  const r = await ensureAdmins({ user: { findMany: async () => { const e = new Error("no column"); e.code = "P2022"; throw e; } } }, { log() {}, error: (m) => errs.push(m) });
  assert.deepEqual(r, { promoted: 0 });
  assert.match(errs[0], /migrate deploy/);
  delete process.env.ADMIN_EMAILS;
});

test("registration cannot grant a role, even with role in the body or an ADMIN_EMAILS address", async () => {
  process.env.JWT_SECRET = "test-secret";
  process.env.ADMIN_EMAILS = "boss@x.com";
  const created = [];
  stub("lib/prisma", {
    user: { findUnique: async () => null, create: async ({ data }) => { created.push(data); return { id: 9, ...data }; } },
  });
  stub("lib/sessions", {});
  stub("services/emailService", { sendPasswordResetEmail: async () => {} });
  const express = require("express");
  const app = express();
  app.use(express.json());
  app.use("/api/auth", require("../../routes/authRoutes"));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Boss", email: "boss@x.com", password: "secret12", role: "admin", isAdmin: true }),
    });
    assert.equal(res.status, 201);
    assert.equal(created.length, 1);
    assert.deepEqual(Object.keys(created[0]).sort(), ["email", "name", "password"], "only name/email/password are persisted -> DB default role 'user'");
  } finally {
    server.close();
    delete process.env.ADMIN_EMAILS;
  }
});

test("make-admin script: promotes, revokes, rejects unknown email and missing argument", () => {
  const preload = path.join(require("node:os").tmpdir(), `mk-admin-preload-${process.pid}.js`);
  fs.writeFileSync(preload, `
    const path=require("path");
    const id=require.resolve(${JSON.stringify(path.join(root, "lib/prisma"))});
    const rows=[{id:1,email:"boss@x.com",role:"user"},{id:2,email:"Dup@x.com",role:"user"},{id:3,email:"dup@x.com",role:"user"}];
    require.cache[id]={id,filename:id,loaded:true,exports:{
      user:{findMany:async({where})=>rows.filter(r=>r.email.toLowerCase()===where.email.equals.toLowerCase()).map(r=>({id:r.id,email:r.email})),
            update:async({where,data})=>{const r=rows.find(r=>r.id===where.id);Object.assign(r,data);console.log("DB id="+r.id+" role="+r.role);return r;}},
      $disconnect:async()=>{}}};`);
  const run = (...args) => spawnSync(process.execPath, ["-r", preload, path.join(root, "scripts/makeAdmin.js"), ...args], { encoding: "utf8", cwd: root });
  try {
    let r = run("Boss@X.com");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /DB id=1 role=admin/);
    r = run("boss@x.com", "--revoke");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /DB id=1 role=user/);
    // two accounts differing only by letter case: never guess which one is meant
    r = run("DUP@x.com");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /ignoring letter case/);
    assert.doesNotMatch(r.stdout, /DB id=/);
    r = run("Dup@x.com");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /DB id=2 role=admin/);
    r = run("nobody@x.com");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /No account/);
    r = run();
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Usage/);
  } finally {
    fs.rmSync(preload, { force: true });
  }
});

test("behaviour when no admin exists: normal users are denied everywhere (fail closed), and nothing auto-promotes", async () => {
  const jwt = require("jsonwebtoken");
  process.env.JWT_SECRET = "test-secret";
  const users = [{ id: 1, role: "user" }, { id: 2, role: null }, { id: 3, role: "ADMIN" }, { id: 4, role: "administrator" }].map((u) => ({ status: "ACTIVE", ...u }));
  stub("lib/prisma", { user: { findUnique: async ({ where }) => users.find((u) => u.id === where.id) || null } });
  delete require.cache[stubPath("middleware/requireAdmin")];
  const requireAdmin = require("../../middleware/requireAdmin");
  const auth = require("../../middleware/authMiddleware");
  const express = require("express");
  const app = express();
  app.get("/x", auth, requireAdmin, (req, res) => res.json({ ok: 1 }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  try {
    for (const id of [1, 2, 3, 4, 77]) {
      const r = await fetch(`http://127.0.0.1:${server.address().port}/x`, { headers: { token: jwt.sign({ id, typ: "access" }, "test-secret") } });
      assert.ok([403, 401].includes(r.status), `id ${id} -> ${r.status}`);
    }
  } finally { server.close(); }
});
