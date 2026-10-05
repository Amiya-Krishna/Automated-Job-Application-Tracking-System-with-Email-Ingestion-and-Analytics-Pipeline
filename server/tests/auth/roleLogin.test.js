// Role-based sign-in, driven over HTTP against the REAL routers/middleware
// with an in-memory Prisma. The client-selected role is only a request; the DB role decides.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-secret";
const stub = (rel, exports) => { const id = require.resolve(path.join("..", "..", rel)); require.cache[id] = { id, filename: id, loaded: true, exports }; };
// The generated Prisma client may not exist where tests run; only its error class is used by authRoutes.
{ const id = require.resolve("@prisma/client", { paths: [path.join(__dirname, "..", "..")] }); require.cache[id] = require.cache[id] || { id, filename: id, loaded: true, exports: { Prisma: { PrismaClientKnownRequestError: class extends Error {} } } }; }
const hash = bcrypt.hashSync("secret12", 4);
const users = [
  { id: 1, name: "Admin", email: "admin@x.co", password: hash, role: "admin" },
  { id: 2, name: "User", email: "user@x.co", password: hash, role: "user" },
];
let issued = 0;
stub("lib/prisma", {
  user: { findUnique: async ({ where }) => users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) || null },
  job_sources: { findMany: async () => [{ id: 1, name: "linkedin", base_url: "x", created_at: new Date(), _count: { jobs: 0 } }], findUnique: async () => null },
  trackedJob: { groupBy: async () => [], findMany: async () => [] },
});
stub("lib/sessions", { issueSession: async () => { issued += 1; return { accessToken: "a", accessTokenExpiresAt: 0, expiresIn: 1, refreshToken: "r" }; } });
stub("services/emailService", { sendPasswordResetEmail: async () => {} });

const express = require("express");
const auth = require("../../middleware/authMiddleware");
const requireAdmin = require("../../middleware/requireAdmin");
const app = express();
app.use(express.json());
app.use("/api/auth", require("../../routes/authRoutes"));
app.use("/api/sources", auth, requireAdmin, require("../../routes/sourcesRoutes"));
let server, base;
test.before(async () => { server = http.createServer(app); await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const login = (body, client = "extension") => fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "x-client": client }, body: JSON.stringify({ password: "secret12", ...body }) });

test("admin sign-in: a normal user with the right password is refused (403) and gets no session", async () => {
  const before = issued;
  const r = await login({ email: "user@x.co", role: "admin" });
  assert.equal(r.status, 403);
  const j = await r.json();
  assert.equal(j.code, "admin_required");
  assert.ok(!j.token && !j.accessToken && !j.refreshToken);
  assert.equal(issued, before);
});

test("admin sign-in: a real admin succeeds and the response carries the DB role", async () => {
  const r = await login({ email: "admin@x.co", role: "admin" });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).user.role, "admin");
});

test("admin door never reveals whether an account exists (generic message for unknown email / wrong password)", async () => {
  const a = await login({ email: "ghost@x.co", role: "admin" });
  const b = await login({ email: "admin@x.co", role: "admin", password: "wrong-pass" });
  assert.equal(a.status, 400); assert.equal(b.status, 400);
  assert.equal((await a.json()).message, "Invalid email or password");
  assert.equal((await b.json()).message, "Invalid email or password");
});

test("user sign-in still works for users (and the legacy no-role request is unchanged); invalid role -> 400", async () => {
  assert.equal((await login({ email: "user@x.co", role: "user" })).status, 200);
  assert.equal((await login({ email: "user@x.co" })).status, 200);
  assert.equal((await login({ email: "user@x.co", role: "superuser" })).status, 400);
  const u = await (await login({ email: "user@x.co", role: "user" })).json();
  assert.equal(u.user.role, "user", "choosing the user door never grants a role");
});

// Sources are role-aware (users: Manual/Gmail/Extension; admin: fetched sources) - see
// tests/isolation/ownership.test.js.
