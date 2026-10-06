// GET /api/gmail/scan + POST /api/gmail/import through the REAL router with a fake Gmail API.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-secret";
const stub = (rel, exports) => { const id = require.resolve(path.join("..", "..", rel)); require.cache[id] = { id, filename: id, loaded: true, exports }; };

const M = (id, subject, from, snippet = "", extra = {}) => ({ id, threadId: extra.threadId || "t" + id, snippet, labelIds: extra.labelIds || ["INBOX"], payload: { headers: [{ name: "Subject", value: subject }, { name: "From", value: from }, { name: "Date", value: "Sat, 03 Oct 2026 10:00:00 +0530" }, ...(extra.headers || [])] } });
const INBOX = [
  M("1", "Your application to Backend Engineer at Acme", "Acme Careers <jobs@acme.com>", "Thank you for applying to Backend Engineer at Acme"),
  M("2", "Summer Internship 2027 - Application received", "Globex Talent <talent@globex.com>", "We received your internship application for Software Intern"),
  M("3", "Interview invitation: Data Analyst at Initech", "Initech Recruiting <recruiter@initech.com>", "We would like to schedule an interview", { headers: [{ name: "Reply-To", value: "Jane <jane@initech.com>" }] }),
  M("4", "Online assessment for Data Analyst role", "HackerRank <noreply@hackerrank.com>", "Complete your coding assessment within 7 days"),
  M("5", "Update on your application at Umbrella", "Umbrella HR <hr@umbrella.com>", "Unfortunately we will not be moving forward"),
  M("6", "Weekly newsletter: 10 career tips", "Medium <noreply@medium.com>", "", { headers: [{ name: "List-Unsubscribe", value: "<mailto:x>" }] }),
  M("7", "Flat 50% off - special offer just for you!", "Shop <deals@shop.example.com>", "", { headers: [{ name: "List-Unsubscribe", value: "<x>" }] }),
  M("8", "Your OTP is 482913", "HDFC Bank <alerts@hdfcbank.net>"),
  M("9", "Priya Rao invited you to connect", "LinkedIn <invitations@linkedin.com>"),
  M("10", "Dinner on Saturday?", "Mom <mom@gmail.com>", "Are you free"),
  M("11", "Your application to Backend Engineer at Acme", "Acme Careers <jobs@acme.com>", "Thank you for applying", { threadId: "t1" }), // same thread as #1
  M("12", "Interview invitation: Old Co", "Old Co HR <hr@oldco.com>", "interview for Analyst"), // already imported
];
const calls = { list: [], get: [] };
const gmailApi = {
  users: { messages: {
    list: async (a) => { calls.list.push(a); return { data: { messages: INBOX.map((m) => ({ id: m.id, threadId: m.threadId })) } }; },
    get: async (a) => { calls.get.push(a); return { data: INBOX.find((m) => m.id === a.id) }; },
  } },
};
const imported = [{ externalJobId: "12" }];
const created = [];
stub("lib/prisma", {
  user: { findUnique: async () => ({ id: 1, status: "ACTIVE", gmailRefreshToken: "rt" }) },
  trackedJob: {
    findMany: async () => imported,
    findFirst: async ({ where }) => created.find((c) => c.externalJobId === where.externalJobId) || null,
    create: async ({ data }) => { const r = { id: created.length + 1, ...data }; created.push(r); return r; },
  },
});
stub("config/google", { getOAuthClient: () => ({ setCredentials() {} }), GMAIL_SCOPES: [] });
stub("services/engineBridge", { bridgeTrackedJobToEngine: async () => {} });
const googleId = require.resolve("googleapis");
require.cache[googleId] = { id: googleId, filename: googleId, loaded: true, exports: { google: { gmail: () => gmailApi } } };

const express = require("express");
const app = express();
app.use(express.json());
app.use("/api/gmail", require("../../routes/gmailRoutes"));
let server, base;
test.before(async () => { server = http.createServer(app); await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const tok = jwt.sign({ id: 1, typ: "access" }, "test-secret");
const get = (p) => fetch(base + p, { headers: { token: tok } });

test("scan returns ONLY job/internship/interview/assessment/rejection mail, de-duplicated and without already-imported mail", async () => {
  const r = await get("/api/gmail/scan");
  assert.equal(r.status, 200);
  const { messages, stats } = await r.json();
  assert.deepEqual(messages.map((m) => m.id).sort(), ["1", "2", "3", "4", "5"], JSON.stringify(stats));
  assert.equal(stats.scanned, 12);
  assert.equal(stats.relevant, 5);
  assert.ok(stats.skipped.duplicate >= 1, "same-thread duplicate collapsed");
  assert.equal(stats.skipped.alreadyImported, 1);
});

test("company / role / status / contact are extracted", async () => {
  const { messages } = await (await get("/api/gmail/scan")).json();
  const by = Object.fromEntries(messages.map((m) => [m.id, m]));
  assert.equal(by["1"].company, "Acme");
  assert.match(by["1"].role, /Backend Engineer/);
  assert.equal(by["3"].status, "Interview");
  assert.equal(by["3"].contactEmail, "jane@initech.com", "Reply-To is preferred");
  assert.equal(by["5"].status, "Rejected");
  assert.equal(by["2"].contactEmail, "talent@globex.com");
});

test("metadata-first: the Gmail query narrows by category/subject, messages are fetched with format=metadata only, and no raw headers/body reach the client", async () => {
  assert.match(calls.list[0].q, /-category:promotions/);
  assert.match(calls.list[0].q, /newer_than:30d/);
  assert.ok(calls.get.length > 0);
  for (const g of calls.get) {
    assert.equal(g.format, "metadata");
    assert.ok(Array.isArray(g.metadataHeaders) && g.metadataHeaders.length <= 8);
  }
  const { messages } = await (await get("/api/gmail/scan")).json();
  for (const m of messages) {
    assert.equal("headers" in m, false);
    assert.equal("labelIds" in m, false);
    assert.equal("body" in m, false);
    assert.ok(m.snippet.length <= 300, "only the short Gmail snippet is passed on");
  }
});

test("import is idempotent per Gmail message id and stores the contact email in the notes", async () => {
  const body = { company: "Initech", role: "Data Analyst", status: "Interview", messageId: "3", contactEmail: "jane@initech.com", notes: "interview mail" };
  const post = () => fetch(base + "/api/gmail/import", { method: "POST", headers: { "Content-Type": "application/json", token: tok }, body: JSON.stringify(body) });
  const a = await post();
  assert.ok([200, 201].includes(a.status), String(a.status));
  const b = await post();
  assert.ok([200, 201].includes(b.status));
  assert.equal(created.filter((c) => c.externalJobId === "3").length, 1, "second import did not create a duplicate");
  assert.match(created[0].notes, /Contact: jane@initech\.com/);
  assert.equal(created[0].sourceName, "gmail");
});
