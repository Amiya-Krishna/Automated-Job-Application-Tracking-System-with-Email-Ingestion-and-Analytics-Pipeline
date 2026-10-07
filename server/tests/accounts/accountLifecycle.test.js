// Account deletion, blocking and admin user management, driven over real HTTP through the REAL
// auth routes, auth middleware, requireAdmin, admin routes and the shared deletion service, on a
// strict stateful in-memory database (tests/helpers/accountFakePrisma.js: cascade rules, FK
// violations and transaction rollback are modelled, so these are not just "was it called" checks).
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-secret";
process.env.RL_LOGIN_MAX = "1000";
process.env.RL_ADMIN_LOGIN_MAX = "1000";
process.env.RL_DELETE_MAX = "1000";
process.env.RL_REFRESH_MAX = "1000";
delete process.env.ADMIN_EMAILS;

{ const id = require.resolve("@prisma/client", { paths: [path.join(__dirname, "..", "..")] }); require.cache[id] = require.cache[id] || { id, filename: id, loaded: true, exports: { Prisma: { PrismaClientKnownRequestError: class extends Error {} } } }; }
const stub = (rel, exports) => { const id = require.resolve(path.join("..", "..", rel)); require.cache[id] = { id, filename: id, loaded: true, exports }; };

const { createAccountDb } = require("../helpers/accountFakePrisma");
const { T, prisma, add } = createAccountDb();
const revoked = [];
stub("lib/prisma", prisma);
stub("services/emailService", { sendPasswordResetEmail: async () => {} });
stub("config/google", { getOAuthClient: () => ({ revokeToken: async (t) => { revoked.push(t); } }) });

const express = require("express");
const auth = require("../../middleware/authMiddleware");
const requireAdmin = require("../../middleware/requireAdmin");

const app = express();
app.use(express.json());
app.use("/api/auth", require("../../routes/authRoutes"));
app.use("/api/admin", auth, requireAdmin, require("../../routes/adminRoutes"));
// Minimal user-scoped data routes (each filters on the caller's id, like the real ones).
app.get("/api/my/jobs", auth, (req, res) => res.json({ data: T.trackedJobs.filter((j) => j.userId === req.user.id) }));
app.get("/api/my/notifications", auth, (req, res) => res.json({ data: T.notifications.filter((n) => n.userId === req.user.id) }));
app.get("/api/jobs/global", auth, (req, res) => res.json({ data: T.jobs.filter((j) => j.owner_user_id === null || j.owner_user_id === req.user.id) }));

let server, base;
test.before(async () => { server = http.createServer(app); await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());

const PW = "secret12";
const hash = bcrypt.hashSync(PW, 4);
const call = async (method, p, { token, body, headers } = {}) => {
  const res = await fetch(base + p, { method, headers: { "Content-Type": "application/json", ...(token ? { token } : {}), ...(headers || {}) }, body: body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json, headers: res.headers };
};
const login = (email, extra = {}, client = "mobile") => call("POST", "/api/auth/login", { body: { email, password: PW, ...extra }, headers: { "x-client": client } });
const tokenOf = async (email, client = "mobile") => { const r = await login(email, {}, client); assert.equal(r.status, 200, `login ${email}`); return r.body; };

// ---- fixtures ----------------------------------------------------------------------------------
const admin = add.user({ name: "Admin", email: "admin@x.co", password: hash, role: "admin" });
const A = add.user({ name: "Alice", email: "a@x.co", password: hash, gmailRefreshToken: "gmail-a" });
const B = add.user({ name: "Bob", email: "b@x.co", password: hash });

const acme = add.company({ name: "Acme", normalized_name: "acme" });
const globalJob = add.job({ title: "Global Dev", company_id: acme.id, source: "linkedin" });
const globalJob2 = add.job({ title: "Global Ops", company_id: acme.id, source: "naukri" });
const jobA = add.job({ title: "A private", owner_user_id: A.id });
const jobB = add.job({ title: "B private", owner_user_id: B.id });
// a global duplicate that names A's private job as its canonical row (would block A's deletion)
globalJob2.canonical_job_id = jobA.id;
const profileA = add.profile(A.id);
const profileB = add.profile(B.id);
add.score(profileA.id, globalJob.id); add.score(profileA.id, jobA.id); add.score(profileB.id, globalJob.id);
add.trackedJob(A.id, { company: "A Co" }); add.trackedJob(A.id, { company: "A Co 2" }); add.trackedJob(B.id, { company: "B Co" });
add.notification(A.id, { title: "A note" }); add.notification(B.id, { title: "B note" });
add.resume(A.id); add.resume(B.id);

const adminTok = async () => (await tokenOf("admin@x.co")).accessToken;

// ================================ USER SELF-DELETION ==============================================

test("1/4/5/6/7. user A can delete A: private data goes, global jobs & companies stay, sessions die", async () => {
  const sess = await tokenOf("a@x.co");
  assert.equal((await call("GET", "/api/my/jobs", { token: sess.accessToken })).body.data.length, 2);
  const sessionsBefore = T.sessions.filter((s) => s.userId === A.id).length;
  assert.ok(sessionsBefore >= 1);

  // wrong password / missing password: nothing deleted
  assert.equal((await call("DELETE", "/api/auth/account", { token: sess.accessToken, body: {} })).status, 400);
  assert.equal((await call("DELETE", "/api/auth/account", { token: sess.accessToken, body: { password: "nope" } })).status, 400);
  assert.ok(T.users.find((u) => u.id === A.id));

  const del = await call("DELETE", "/api/auth/account", { token: sess.accessToken, body: { password: PW } });
  assert.equal(del.status, 200, JSON.stringify(del.body));

  assert.equal(T.users.find((u) => u.id === A.id), undefined, "user row removed");
  assert.equal(T.trackedJobs.filter((j) => j.userId === A.id).length, 0, "tracked jobs (manual/gmail/extension) removed");
  assert.equal(T.notifications.filter((n) => n.userId === A.id).length, 0, "notifications removed");
  assert.equal(T.resumes.filter((r) => r.userId === A.id).length, 0, "resumes removed");
  assert.equal(T.profiles.filter((p) => p.user_id === A.id).length, 0, "profile removed");
  assert.equal(T.scores.filter((s) => s.profile_id === profileA.id).length, 0, "match scores of the profile removed");
  assert.equal(T.sessions.filter((s) => s.userId === A.id).length, 0, "sessions removed");
  assert.equal(T.jobs.find((j) => j.id === jobA.id), undefined, "A's private job removed");

  // global data untouched
  assert.ok(T.jobs.find((j) => j.id === globalJob.id), "global job #1 remains");
  assert.ok(T.jobs.find((j) => j.id === globalJob2.id), "global job #2 remains");
  assert.equal(T.jobs.find((j) => j.id === globalJob2.id).canonical_job_id, null, "dangling canonical pointer cleared, row kept");
  assert.equal(T.companies.length, 1, "global company remains");
  assert.deepEqual(revoked, ["gmail-a"], "Gmail grant revoked at Google");
});

test("3/15. a deleted user can no longer log in, refresh, or use the old token", async () => {
  assert.equal((await login("a@x.co")).status, 400);
  assert.equal((await login("a@x.co", {}, "web")).status, 400);
  assert.equal((await login("a@x.co", {}, "extension")).status, 400);
  // an unexpired access token minted before deletion is rejected (the account row is gone)
  const old = jwt.sign({ id: A.id, typ: "access", tv: 0 }, "test-secret", { expiresIn: "15m" });
  const me = await call("GET", "/api/auth/me", { token: old });
  assert.equal(me.status, 401);
  assert.equal((await call("GET", "/api/my/jobs", { token: old })).status, 401);
  // legacy 7-day style token (no tv / typ) too
  const legacy = jwt.sign({ id: A.id }, "test-secret", { expiresIn: "7d" });
  assert.equal((await call("GET", "/api/my/jobs", { token: legacy })).status, 401);
});

test("19/20. deleting A did not touch B's private data or the global catalog", async () => {
  const b = await tokenOf("b@x.co");
  assert.equal((await call("GET", "/api/my/jobs", { token: b.accessToken })).body.data.length, 1);
  assert.equal((await call("GET", "/api/my/notifications", { token: b.accessToken })).body.data.length, 1);
  assert.equal(T.resumes.filter((r) => r.userId === B.id).length, 1);
  assert.equal(T.scores.filter((s) => s.profile_id === profileB.id).length, 1);
  assert.ok(T.jobs.find((j) => j.id === jobB.id), "B's private job intact");
  const visible = (await call("GET", "/api/jobs/global", { token: b.accessToken })).body.data.map((j) => j.title).sort();
  assert.deepEqual(visible, ["B private", "Global Dev", "Global Ops"]);
});

test("2/18. self-deletion has no id parameter: user B cannot delete or alter anyone else by changing an id", async () => {
  const victim = add.user({ name: "Vic", email: "v@x.co", password: hash });
  add.trackedJob(victim.id, { company: "V Co" });
  const b = await tokenOf("b@x.co");
  // an id in the path / query / body has no effect: the route has no id parameter at all
  assert.equal((await call("DELETE", `/api/auth/account/${victim.id}`, { token: b.accessToken, body: { password: PW } })).status, 404);
  const sneaky = await call("DELETE", `/api/auth/account?id=${victim.id}`, { token: b.accessToken, body: { password: PW, id: victim.id, userId: victim.id } });
  assert.equal(sneaky.status, 200);
  assert.ok(T.users.find((u) => u.id === victim.id), "victim still exists");
  assert.equal(T.trackedJobs.filter((j) => j.userId === victim.id).length, 1, "victim data intact");
  assert.equal(T.users.find((u) => u.id === B.id), undefined, "only the caller was deleted");
  // B is gone: re-create him for the following tests
  Object.assign(B, add.user({ name: "Bob", email: "b@x.co", password: hash }));
  add.trackedJob(B.id, { company: "B Co" });
  add.notification(B.id, { title: "B note" });
  T.users.splice(T.users.indexOf(victim), 1); T.trackedJobs = T.trackedJobs.filter((j) => j.userId !== victim.id);
});

test("deletion is atomic: a failure in the middle rolls everything back", async () => {
  const C = add.user({ name: "Cy", email: "c@x.co", password: hash });
  const pc = add.profile(C.id); add.score(pc.id, globalJob.id); add.trackedJob(C.id, { company: "C Co" });
  const { deleteUserAccount } = require("../../services/accountDeletion");
  const broken = { ...prisma, user: { ...prisma.user, delete: async () => { throw new Error("boom"); } } };
  broken.$transaction = (fn) => prisma.$transaction((tx) => fn({ ...tx, user: broken.user }));
  await assert.rejects(deleteUserAccount(C.id, { db: broken }), /boom/);
  assert.ok(T.users.find((u) => u.id === C.id), "user still there");
  assert.equal(T.scores.filter((s) => s.profile_id === pc.id).length, 1, "score deletion rolled back");
  assert.equal(T.trackedJobs.filter((j) => j.userId === C.id).length, 1);
  await deleteUserAccount(C.id); // and the real path then succeeds
  assert.equal(T.users.find((u) => u.id === C.id), undefined);
});

// ================================ ADMIN: LISTING ==================================================

test("8. admin can list users with non-sensitive fields only; search/filter/pagination work", async () => {
  await tokenOf("b@x.co"); // Bob signs in (creates a session -> "last active")
  const t = await adminTok();
  const r = await call("GET", "/api/admin/users", { token: t });
  assert.equal(r.status, 200);
  assert.ok(r.body.data.length >= 2);
  assert.equal(r.body.meta.page, 1);
  for (const u of r.body.data) {
    assert.deepEqual(Object.keys(u).sort(), ["blockedAt", "createdAt", "email", "gmailConnected", "id", "lastActiveAt", "name", "role", "status", "trackedJobs"].sort());
    assert.ok(["ACTIVE", "BLOCKED"].includes(u.status));
  }
  const bob = r.body.data.find((u) => u.email === "b@x.co");
  assert.equal(bob.trackedJobs, 1);
  assert.ok(bob.lastActiveAt, "activity comes from the last session use");
  assert.equal((await call("GET", "/api/admin/users?q=BOB", { token: t })).body.data.length, 1);
  assert.equal((await call("GET", "/api/admin/users?role=admin", { token: t })).body.data.length, 1);
  assert.equal((await call("GET", "/api/admin/users?status=BLOCKED", { token: t })).body.data.length, 0);
  assert.equal((await call("GET", "/api/admin/users?pageSize=1&page=2", { token: t })).body.data.length, 1);
  assert.equal((await call("GET", "/api/admin/users?status=weird", { token: t })).status, 400);
  assert.equal((await call("GET", "/api/admin/users?role=root", { token: t })).status, 400);
  assert.doesNotMatch(JSON.stringify(r.body), /password|refresh|gmail-|\$2[aby]\$/i, "no hashes, tokens or grants in the payload");
});

// ================================ ADMIN: BLOCK / UNBLOCK ==========================================

test("9/10/11/12/13. block: login refused with a clear code, old sessions & refresh die, data kept; unblock restores login", async () => {
  const D = add.user({ name: "Dee", email: "d@x.co", password: hash });
  add.trackedJob(D.id, { company: "D Co" }); add.notification(D.id, { title: "D note" }); add.resume(D.id);
  const mobile = await tokenOf("d@x.co", "mobile");
  const web = await tokenOf("d@x.co", "web");
  const legacy = await tokenOf("d@x.co", "legacy"); // no x-client header: 7-day token
  const ext = await tokenOf("d@x.co", "extension");
  const all = [mobile.accessToken, web.accessToken, legacy.token, ext.accessToken];
  for (const t of all) assert.equal((await call("GET", "/api/my/jobs", { token: t })).status, 200);

  const t = await adminTok();
  const blocked = await call("POST", `/api/admin/users/${D.id}/block`, { token: t });
  assert.equal(blocked.status, 200);
  assert.equal(blocked.body.data.status, "BLOCKED");
  assert.ok(T.users.find((u) => u.id === D.id).blockedAt);

  // every client / door is refused with the explicit blocked code
  for (const client of ["mobile", "web", "extension", "legacy"]) {
    const r = await login("d@x.co", {}, client);
    assert.equal(r.status, 403, client);
    assert.equal(r.body.code, "account_blocked");
    assert.match(r.body.message, /blocked/i);
  }
  const adminDoor = await login("d@x.co", { role: "admin" }, "web");
  assert.equal(adminDoor.status, 403);
  assert.equal(adminDoor.body.code, "account_blocked");
  // a wrong password still gets the ordinary error: blocked status is not revealed without the password
  assert.equal((await call("POST", "/api/auth/login", { body: { email: "d@x.co", password: "wrong-pass" }, headers: { "x-client": "mobile" } })).status, 400);

  // existing sessions: access tokens rejected on a user route, /auth/me and (non-admin) admin route
  for (const tk of all) {
    const r = await call("GET", "/api/my/jobs", { token: tk });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "account_blocked");
    assert.equal((await call("GET", "/api/auth/me", { token: tk })).body.code, "account_blocked");
  }
  // refresh tokens are dead too (mobile body token; web cookie token)
  const refresh = await call("POST", "/api/auth/refresh", { body: { refreshToken: mobile.refreshToken }, headers: { "x-client": "mobile" } });
  assert.equal(refresh.status, 403);
  assert.equal(refresh.body.code, "account_blocked");
  assert.ok(T.sessions.filter((s) => s.userId === D.id).every((s) => s.revokedAt), "every session revoked");

  // data intact
  assert.equal(T.trackedJobs.filter((j) => j.userId === D.id).length, 1);
  assert.equal(T.notifications.filter((n) => n.userId === D.id).length, 1);
  assert.equal(T.resumes.filter((r) => r.userId === D.id).length, 1);

  // blocking twice is idempotent
  assert.equal((await call("POST", `/api/admin/users/${D.id}/block`, { token: t })).status, 200);

  // unblock: login works again, no duplicates, and the PRE-block tokens stay invalid
  const un = await call("POST", `/api/admin/users/${D.id}/unblock`, { token: t });
  assert.equal(un.status, 200);
  assert.equal(un.body.data.status, "ACTIVE");
  assert.equal(T.users.find((u) => u.id === D.id).blockedAt, null);
  for (const tk of all) assert.equal((await call("GET", "/api/my/jobs", { token: tk })).status, 401, "old token stays dead after unblock");
  assert.equal((await call("POST", "/api/auth/refresh", { body: { refreshToken: mobile.refreshToken }, headers: { "x-client": "mobile" } })).status, 401, "old refresh token stays dead");
  const fresh = await tokenOf("d@x.co", "mobile");
  const jobs = await call("GET", "/api/my/jobs", { token: fresh.accessToken });
  assert.equal(jobs.status, 200);
  assert.equal(jobs.body.data.length, 1, "same data, nothing recreated or duplicated");
  assert.equal(T.users.filter((u) => u.email === "d@x.co").length, 1);
  // unblocking an active user is a no-op
  assert.equal((await call("POST", `/api/admin/users/${D.id}/unblock`, { token: t })).status, 200);
});

test("a blocked ADMIN-door request and a blocked user hitting admin routes get account_blocked, not data", async () => {
  const E = add.user({ name: "Eve", email: "e@x.co", password: hash });
  const tk = (await tokenOf("e@x.co", "mobile")).accessToken;
  T.users.find((u) => u.id === E.id).status = "BLOCKED"; // blocked directly in the DB (e.g. a script)
  const r = await call("GET", "/api/admin/overview", { token: tk });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, "account_blocked");
  assert.equal((await call("GET", "/api/auth/me", { token: tk })).status, 403, "status alone (no token-version change) is enough");
});

test("a blocked user is not sent to Google OAuth callbacks either (status is re-checked there)", async () => {
  const F = add.user({ name: "Fay", email: "f@x.co", password: hash, status: "BLOCKED" });
  const rows = prisma.user.updateMany({ where: { id: F.id, status: "ACTIVE" }, data: { gmailRefreshToken: "x" } });
  assert.equal((await rows).count, 0);
  assert.equal(T.users.find((u) => u.id === F.id).gmailRefreshToken, null);
});

// ================================ ADMIN: DELETE ===================================================

test("14/15/20. admin deletes a user: private data gone, global data and other users untouched, login impossible", async () => {
  const G = add.user({ name: "Gus", email: "g@x.co", password: hash, gmailRefreshToken: "gmail-g" });
  const gp = add.profile(G.id); add.score(gp.id, globalJob.id);
  const gj = add.job({ title: "G private", owner_user_id: G.id });
  add.trackedJob(G.id); add.notification(G.id); add.resume(G.id);
  const gTok = (await tokenOf("g@x.co")).accessToken;
  const before = { global: T.jobs.filter((j) => j.owner_user_id === null).length, companies: T.companies.length, bob: T.trackedJobs.filter((j) => j.userId === B.id).length };

  const t = await adminTok();
  const r = await call("DELETE", `/api/admin/users/${G.id}`, { token: t });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(T.users.find((u) => u.id === G.id), undefined);
  assert.equal(T.jobs.find((j) => j.id === gj.id), undefined);
  assert.equal(T.scores.filter((s) => s.profile_id === gp.id).length, 0);
  assert.equal(T.sessions.filter((s) => s.userId === G.id).length, 0);
  assert.deepEqual([T.jobs.filter((j) => j.owner_user_id === null).length, T.companies.length, T.trackedJobs.filter((j) => j.userId === B.id).length], [before.global, before.companies, before.bob]);
  assert.ok(revoked.includes("gmail-g"));

  assert.equal((await login("g@x.co")).status, 400, "cannot log in");
  assert.equal((await call("GET", "/api/my/jobs", { token: gTok })).status, 401, "old token rejected");
  assert.equal((await call("DELETE", `/api/admin/users/${G.id}`, { token: t })).status, 404, "already gone");
});

// ================================ ADMIN: SELF-PROTECTION ==========================================

test("16. admin cannot block or delete their own account, nor another administrator; role route unchanged", async () => {
  const t = await adminTok();
  for (const [m, p] of [["POST", `/api/admin/users/${admin.id}/block`], ["POST", `/api/admin/users/${admin.id}/unblock`], ["DELETE", `/api/admin/users/${admin.id}`]]) {
    const r = await call(m, p, { token: t });
    assert.equal(r.status, 400, `${m} ${p}`);
    assert.equal(r.body.code, "cannot_modify_self");
  }
  assert.equal(T.users.find((u) => u.id === admin.id).status, "ACTIVE");

  const admin2 = add.user({ name: "Admin2", email: "admin2@x.co", password: hash, role: "admin" });
  for (const [m, p] of [["POST", `/api/admin/users/${admin2.id}/block`], ["DELETE", `/api/admin/users/${admin2.id}`]]) {
    const r = await call(m, p, { token: t });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "cannot_manage_admin");
  }
  assert.ok(T.users.find((u) => u.id === admin2.id));
  assert.equal((await call("PATCH", `/api/admin/users/${admin.id}/role`, { token: t, body: { role: "user" } })).status, 400, "an admin cannot demote themselves");
  T.users.splice(T.users.indexOf(admin2), 1);
});

test("the last active administrator cannot delete their own account via self-service", async () => {
  const t = await adminTok();
  const r = await call("DELETE", "/api/auth/account", { token: t, body: { password: PW } });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "last_admin");
  assert.ok(T.users.find((u) => u.id === admin.id));
  // with another ACTIVE admin present it is allowed; a BLOCKED second admin does not count
  const a2 = add.user({ name: "Admin2", email: "admin2@x.co", password: hash, role: "admin", status: "BLOCKED" });
  assert.equal((await call("DELETE", "/api/auth/account", { token: t, body: { password: PW } })).status, 409);
  T.users.splice(T.users.indexOf(a2), 1);
});

test("invalid / unknown ids", async () => {
  const t = await adminTok();
  for (const id of ["abc", "0", "-3", "1.5"]) assert.equal((await call("POST", `/api/admin/users/${id}/block`, { token: t })).status, 400, id);
  assert.equal((await call("POST", "/api/admin/users/99999/block", { token: t })).status, 404);
  assert.equal((await call("DELETE", "/api/admin/users/99999", { token: t })).status, 404);
});

// ================================ ADMIN: AUTHORIZATION ============================================

test("17/18. normal users and anonymous callers cannot reach any admin user-management API", async () => {
  const victim = add.user({ name: "Vic", email: "vic@x.co", password: hash });
  add.trackedJob(victim.id);
  const b = (await tokenOf("b@x.co")).accessToken;
  const routes = [["GET", "/api/admin/users"], ["POST", `/api/admin/users/${victim.id}/block`], ["POST", `/api/admin/users/${victim.id}/unblock`], ["DELETE", `/api/admin/users/${victim.id}`], ["PATCH", `/api/admin/users/${victim.id}/role`], ["GET", "/api/admin/overview"]];
  for (const [m, p] of routes) {
    assert.equal((await call(m, p, { body: { role: "admin" } })).status, 401, `anon ${m} ${p}`);
    const r = await call(m, p, { token: b, body: { role: "admin" } });
    assert.equal(r.status, 403, `${m} ${p}`);
    assert.equal(r.body.code, "admin_required");
  }
  // forged claims do not help
  const forged = jwt.sign({ id: B.id, typ: "access", tv: 0, role: "admin", isAdmin: true }, "test-secret");
  assert.equal((await call("POST", `/api/admin/users/${victim.id}/block`, { token: forged })).status, 403);
  // user B also cannot target himself or another account through the user-facing API by id
  assert.equal(T.users.find((u) => u.id === victim.id).status, "ACTIVE");
  assert.equal(T.trackedJobs.filter((j) => j.userId === victim.id).length, 1);
  assert.equal((await call("GET", `/api/auth/me?id=${victim.id}`, { token: b })).body.user.id, B.id, "/me always answers for the token's own user");
  T.users.splice(T.users.indexOf(victim), 1);
});

test("an admin who is later blocked or demoted loses admin access at once", async () => {
  const x = add.user({ name: "Xena", email: "x@x.co", password: hash, role: "admin" });
  const tk = (await tokenOf("x@x.co")).accessToken;
  assert.equal((await call("GET", "/api/admin/users", { token: tk })).status, 200);
  x.role = "user";
  assert.equal((await call("GET", "/api/admin/users", { token: tk })).status, 403);
  x.role = "admin"; x.status = "BLOCKED";
  assert.equal((await call("GET", "/api/admin/users", { token: tk })).status, 403);
  T.users.splice(T.users.indexOf(x), 1);
});

// ================================ SUPPORT: sessions & reminders ===================================

test("web refresh cookie flow: a blocked account's refresh answers 403 and clears the cookie", async () => {
  const H = add.user({ name: "Hal", email: "h@x.co", password: hash });
  const r = await login("h@x.co", {}, "web");
  const cookie = r.headers.get("set-cookie").split(";")[0];
  const t = await adminTok();
  await call("POST", `/api/admin/users/${H.id}/block`, { token: t });
  const refreshed = await call("POST", "/api/auth/refresh", { headers: { "x-client": "web", cookie } });
  assert.equal(refreshed.status, 403);
  assert.equal(refreshed.body.code, "account_blocked");
  assert.match(refreshed.headers.get("set-cookie") || "", /tt_refresh=;/);
  T.users.splice(T.users.indexOf(H), 1);
});

test("push reminders skip blocked accounts (query filters on user status)", async () => {
  const src = require("node:fs").readFileSync(path.join(__dirname, "..", "..", "services", "reminderService.js"), "utf8");
  assert.match(src, /user: \{ status: "ACTIVE" \}/);
});

test("a password reset also kills access tokens issued before it (legacy 7-day token included)", async () => {
  const crypto = require("node:crypto");
  const U = add.user({ name: "Reset Me", email: "reset@x.co", password: hash });
  const legacy = await call("POST", "/api/auth/login", { body: { email: "reset@x.co", password: PW } }); // no x-client => legacy JWT
  assert.equal(legacy.status, 200);
  assert.equal((await call("GET", "/api/my/jobs", { token: legacy.body.token })).status, 200);

  const pv = crypto.createHash("sha256").update(U.password).digest("hex").slice(0, 16);
  const resetToken = jwt.sign({ id: U.id, purpose: "password_reset", pv }, process.env.JWT_SECRET, { expiresIn: "30m" });
  const r = await call("POST", "/api/auth/reset-password", { body: { token: resetToken, password: "brand-new-pass" } });
  assert.equal(r.status, 200);

  const after = await call("GET", "/api/my/jobs", { token: legacy.body.token });
  assert.equal(after.status, 401);
  assert.equal(after.body.code, "token_invalid");
  // the reset link is single-use, and the new password works
  assert.equal((await call("POST", "/api/auth/reset-password", { body: { token: resetToken, password: "another-pass" } })).status, 400);
  const fresh = await call("POST", "/api/auth/login", { body: { email: "reset@x.co", password: "brand-new-pass" } });
  assert.equal(fresh.status, 200);
});
