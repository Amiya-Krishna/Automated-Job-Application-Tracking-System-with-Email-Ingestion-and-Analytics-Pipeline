// Reminder rules (pure), exactly-once delivery, push-token handling and the
// notification HTTP routes. Prisma and Expo's HTTP API are stubbed.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-secret";
process.env.CRON_SECRET = "cron-secret-value";

const TOKEN = "ExponentPushToken[abcdefghijklmnop]";
const db = { devices: [], prefs: [], logs: [], jobs: [], scores: [], profiles: [] };
const stub = (rel, exports) => {
  const id = require.resolve(path.join("..", "..", rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
};
stub("lib/prisma", {
  user: { findUnique: async ({ where }) => ({ id: where.id, status: "ACTIVE", tokenVersion: 0 }) },
  pushDevice: {
    upsert: async ({ where, create, update }) => {
      const row = db.devices.find((d) => d.expoPushToken === where.expoPushToken);
      if (row) return Object.assign(row, update);
      db.devices.push({ ...create }); return create;
    },
    deleteMany: async ({ where }) => { const n = db.devices.length; db.devices = db.devices.filter((d) => !(d.expoPushToken === where.expoPushToken && d.userId === where.userId)); return { count: n - db.devices.length }; },
    findMany: async ({ where, distinct }) => {
      let rows = db.devices.filter((d) => (where.disabledAt === null ? !d.disabledAt : true) && (where.userId === undefined || d.userId === where.userId));
      if (distinct) rows = [...new Map(rows.map((r) => [r.userId, { userId: r.userId }])).values()];
      return rows;
    },
    updateMany: async ({ where, data }) => { db.devices.filter((d) => where.expoPushToken.in.includes(d.expoPushToken)).forEach((d) => Object.assign(d, data)); return { count: 1 }; },
  },
  notificationPreference: {
    findUnique: async ({ where }) => db.prefs.find((p) => p.userId === where.userId) || null,
    upsert: async ({ where, create, update }) => {
      const row = db.prefs.find((p) => p.userId === where.userId);
      if (row) return Object.assign(row, update);
      const made = { pushEnabled: true, interviewReminders: true, applicationReminders: true, jobReminders: true, timezone: "UTC", reminderHour: 9, ...create };
      db.prefs.push(made); return made;
    },
  },
  notificationLog: {
    create: async ({ data }) => {
      if (db.logs.some((l) => l.userId === data.userId && l.dedupeKey === data.dedupeKey)) { const e = new Error("dup"); e.code = "P2002"; throw e; }
      const row = { id: db.logs.length + 1, ...data }; db.logs.push(row); return row;
    },
    delete: async ({ where }) => { db.logs = db.logs.filter((l) => l.id !== where.id); },
  },
  trackedJob: { findMany: async ({ where }) => db.jobs.filter((j) => j.userId === where.userId) },
  user_profile: { findUnique: async () => db.profiles[0] || null },
  match_scores: { findMany: async () => db.scores },
});

const { buildReminders, runReminders, zonedParts } = require("../../services/reminderService");
const push = require("../../services/pushService");

const at = (iso) => new Date(iso);
const prefs = (o = {}) => ({ pushEnabled: true, interviewReminders: true, applicationReminders: true, jobReminders: true, timezone: "UTC", reminderHour: 9, ...o });

test("zonedParts evaluates the day and hour in the user's timezone", () => {
  assert.deepEqual(zonedParts(at("2026-09-29T20:00:00Z"), "Asia/Kolkata"), { ymd: "2026-09-30", hour: 1 });
  assert.deepEqual(zonedParts(at("2026-09-29T20:00:00Z"), "Not/AZone"), { ymd: "2026-09-29", hour: 20 });
});

test("interview reminders: day before and day of, only after the reminder hour, only for Interview status", () => {
  const jobs = [{ id: 1, company: "Acme", role: "SDE Intern", status: "Interview", interviewDate: "2026-10-01" }];
  assert.equal(buildReminders({ prefs: prefs(), trackedJobs: jobs, now: at("2026-09-30T08:59:00Z") }).length, 0, "before 09:00");
  const dayBefore = buildReminders({ prefs: prefs(), trackedJobs: jobs, now: at("2026-09-30T09:00:00Z") });
  assert.equal(dayBefore.length, 1);
  assert.equal(dayBefore[0].title, "Interview tomorrow");
  assert.equal(dayBefore[0].dedupeKey, "interview:1:2026-10-01:d1");
  assert.deepEqual(dayBefore[0].data.target, { pathname: "/application/[id]", params: { id: "1" } });
  assert.equal(buildReminders({ prefs: prefs(), trackedJobs: jobs, now: at("2026-10-01T10:00:00Z") })[0].title, "Interview today");
  assert.equal(buildReminders({ prefs: prefs(), trackedJobs: jobs, now: at("2026-10-02T10:00:00Z") }).length, 0, "past interview");
  assert.equal(buildReminders({ prefs: prefs(), trackedJobs: [{ ...jobs[0], status: "Offer" }], now: at("2026-09-30T10:00:00Z") }).length, 0);
  assert.equal(buildReminders({ prefs: prefs(), trackedJobs: [{ ...jobs[0], interviewDate: "2026-10-01T14:30:00.000Z" }], now: at("2026-09-30T10:00:00Z") }).length, 1, "ISO datetimes work");
});

test("follow-up reminder after 7 days without an update, not before, not after 30", () => {
  const job = (d) => [{ id: 5, company: "Beta", role: "Dev", status: "Applied", applicationDate: new Date(`${d}T00:00:00Z`) }];
  const now = at("2026-09-29T12:00:00Z");
  assert.equal(buildReminders({ prefs: prefs(), trackedJobs: job("2026-09-23"), now }).length, 0);
  const due = buildReminders({ prefs: prefs(), trackedJobs: job("2026-09-22"), now });
  assert.equal(due[0].dedupeKey, "followup:5");
  assert.equal(buildReminders({ prefs: prefs(), trackedJobs: job("2026-08-01"), now }).length, 0);
});

test("preferences gate every category; push disabled silences everything", () => {
  const jobs = [
    { id: 1, company: "A", role: "R", status: "Interview", interviewDate: "2026-09-30" },
    { id: 2, company: "B", role: "R", status: "Applied", applicationDate: new Date("2026-09-01T00:00:00Z") },
  ];
  const matches = [{ id: "9", title: "Backend Engineer" }];
  const now = at("2026-09-29T10:00:00Z");
  assert.equal(buildReminders({ prefs: prefs(), trackedJobs: jobs, topMatches: matches, now }).length, 3);
  assert.equal(buildReminders({ prefs: prefs({ interviewReminders: false }), trackedJobs: jobs, topMatches: matches, now }).length, 2);
  assert.equal(buildReminders({ prefs: prefs({ applicationReminders: false }), trackedJobs: jobs, topMatches: matches, now }).length, 2);
  assert.equal(buildReminders({ prefs: prefs({ jobReminders: false }), trackedJobs: jobs, topMatches: matches, now }).length, 2);
  assert.equal(buildReminders({ prefs: prefs({ pushEnabled: false }), trackedJobs: jobs, topMatches: matches, now }).length, 0);
});

test("job digest links to the single job, or the list for several", () => {
  const now = at("2026-09-29T10:00:00Z");
  const one = buildReminders({ prefs: prefs(), topMatches: [{ id: "9", title: "Backend Engineer" }], now })[0];
  assert.deepEqual(one.data.target, { pathname: "/job/[id]", params: { id: "9" } });
  const many = buildReminders({ prefs: prefs(), topMatches: [{ id: "9", title: "A" }, { id: "10", title: "B" }], now })[0];
  assert.deepEqual(many.data.target, { pathname: "/jobs" });
  assert.match(many.title, /2 new strong job matches/);
});

test("runReminders is exactly-once: a second pass sends nothing; a failed delivery is retried", async () => {
  db.devices = [{ userId: 3, expoPushToken: TOKEN, disabledAt: null }];
  db.prefs = [];
  db.logs = [];
  db.jobs = [{ userId: 3, id: 11, company: "Acme", role: "SDE", status: "Interview", interviewDate: "2026-09-30" }];
  const sent = [];
  const sendToUser = async (userId, payload) => { sent.push({ userId, payload }); return { sent: 1, failed: 0, devices: 1 }; };
  const now = at("2026-09-29T10:00:00Z");
  const first = await runReminders({ prisma: require("../../lib/prisma"), sendToUser, now });
  assert.equal(first.sent, 1);
  const second = await runReminders({ prisma: require("../../lib/prisma"), sendToUser, now });
  assert.equal(second.sent, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.title, "Interview tomorrow");

  db.logs = [];
  const failing = async () => ({ sent: 0, failed: 1, devices: 1 });
  await runReminders({ prisma: require("../../lib/prisma"), sendToUser: failing, now });
  assert.equal(db.logs.length, 0, "log row removed so the next run retries");
});

test("sendPush: chunks, skips invalid tokens and disables DeviceNotRegistered tokens", async () => {
  db.devices = [{ userId: 3, expoPushToken: TOKEN, disabledAt: null }];
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return { ok: true, json: async () => ({ data: body.map(() => ({ status: "error", details: { error: "DeviceNotRegistered" } })) }) };
  };
  const r = await push.sendPush([{ to: TOKEN, title: "t", body: "b" }, { to: "not-a-token", title: "x", body: "y" }], { fetchImpl });
  assert.deepEqual([r.sent, r.failed, r.skipped], [0, 1, 1]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].channelId, "reminders");
  assert.ok(db.devices[0].disabledAt, "dead token disabled");
});

// ---- HTTP routes ----
const express = require("express");
const app = express();
app.use(express.json());
app.use("/api/notifications", require("../../routes/notificationRoutes"));
let server, base;
const auth = { token: jwt.sign({ id: 3, typ: "access" }, "test-secret", { expiresIn: "5m" }) };
test.before(async () => {
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}/api/notifications`;
});
test.after(() => server.close());
const call = (method, p, body, headers = auth) =>
  fetch(base + p, { method, headers: { "Content-Type": "application/json", ...headers }, body: body && method !== "GET" ? JSON.stringify(body) : undefined });

test("routes require auth (except the cron trigger)", async () => {
  for (const [m, p] of [["POST", "/devices"], ["DELETE", "/devices"], ["GET", "/preferences"], ["PUT", "/preferences"], ["POST", "/test"]]) {
    assert.equal((await call(m, p, {}, {})).status, 401, `${m} ${p}`);
  }
});

test("device registration validates the Expo token and stores the timezone", async () => {
  db.devices = []; db.prefs = [];
  assert.equal((await call("POST", "/devices", { expoPushToken: "nope" })).status, 400);
  const ok = await call("POST", "/devices", { expoPushToken: TOKEN, platform: "android", deviceName: "Pixel", timezone: "Asia/Kolkata" });
  assert.equal(ok.status, 201);
  assert.equal(db.devices[0].userId, 3);
  assert.equal(db.prefs[0].timezone, "Asia/Kolkata");
  assert.equal((await call("DELETE", "/devices", { expoPushToken: TOKEN })).status, 200);
  assert.equal(db.devices.length, 0);
});

test("preferences: defaults, partial update, and strict validation", async () => {
  db.prefs = [];
  const def = await (await call("GET", "/preferences")).json();
  assert.equal(def.preferences.pushEnabled, true);
  const upd = await (await call("PUT", "/preferences", { interviewReminders: false, reminderHour: 8, timezone: "Europe/Berlin" })).json();
  assert.equal(upd.preferences.interviewReminders, false);
  assert.equal(upd.preferences.reminderHour, 8);
  for (const bad of [{ pushEnabled: "yes" }, { reminderHour: 24 }, { reminderHour: 1.5 }, { timezone: "Mars/Base" }])
    assert.equal((await call("PUT", "/preferences", bad)).status, 400, JSON.stringify(bad));
});

test("cron trigger: 401 without/with a wrong secret, 200 with the right one", async () => {
  db.devices = [];
  assert.equal((await call("POST", "/run-reminders", {}, {})).status, 401);
  assert.equal((await call("POST", "/run-reminders", {}, { "x-cron-secret": "wrong" })).status, 401);
  const ok = await call("POST", "/run-reminders", {}, { "x-cron-secret": "cron-secret-value" });
  assert.equal(ok.status, 200);
});
