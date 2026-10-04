const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyEmail, filterJobEmails, buildGmailQuery, extractCompany, extractRole, extractContactEmail } = require("../../services/emailRelevance");

const mail = (o) => ({ id: o.id || Math.random().toString(36).slice(2), threadId: o.threadId, subject: "", from: "", snippet: "", labelIds: ["INBOX"], headers: {}, ...o });

const JOB = [
  mail({ subject: "Your application to Software Engineer Intern at Acme", from: '"Acme Careers" <no-reply@us.greenhouse-mail.io>', snippet: "Thank you for applying. We received your application." }),
  mail({ subject: "Interview invitation - Backend Developer", from: "Priya Rao <priya@globex.com>", snippet: "We would like to schedule an interview with you." }),
  mail({ subject: "Thank you for applying to Initech", from: "Initech Recruiting <jobs@initech.io>", snippet: "Your application has been received" }),
  mail({ subject: "Online assessment for Data Analyst role", from: "HackerRank <noreply@hackerrank.com>", snippet: "Complete your coding assessment within 7 days" }),
  mail({ subject: "Update on your application", from: "Hooli Talent <talent@hooli.com>", snippet: "Unfortunately we will not be moving forward with your application" }),
  mail({ subject: "Job offer: Product Analyst", from: "HR <hr@piedpiper.com>", snippet: "We are pleased to offer you the position" }),
  mail({ subject: "Your application was sent to Umbrella Corp", from: "LinkedIn <jobs-noreply@linkedin.com>", snippet: "Your application for Security Analyst was sent" }),
  mail({ subject: "Application received - Data Science Intern", from: "Internshala <noreply@internshala.com>", snippet: "Thanks for applying" }),
];
const NOT_JOB = [
  mail({ subject: "20% off all courses this weekend", from: "Udemy <ud@mail.udemy.com>", labelIds: ["CATEGORY_PROMOTIONS"] }),
  mail({ subject: "Your OTP is 482913", from: "HDFC Bank <alerts@hdfcbank.net>" }),
  mail({ subject: "Priya Rao invited you to connect", from: "LinkedIn <invitations@linkedin.com>" }),
  mail({ subject: "10 new jobs for you: Software Engineer in Pune", from: "LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>" }),
  mail({ subject: "Weekly digest: top interview tips", from: "Medium <noreply@medium.com>", headers: { "list-unsubscribe": "<mailto:x>" } }),
  mail({ subject: "Dinner on Saturday?", from: "Mom <mom@gmail.com>", snippet: "Are you free for dinner" }),
  mail({ subject: "Your Swiggy order has been delivered", from: "Swiggy <noreply@swiggy.in>" }),
  mail({ subject: "Verify your email address", from: "Naukri <noreply@naukri.com>" }),
  mail({ subject: "Special offer just for you!", from: "Shop <deals@shop.example.com>", headers: { "list-unsubscribe": "<x>" } }),
  mail({ subject: "Meeting notes", from: "Boss <boss@work.com>", snippet: "see attached" }),
];

test("every genuine job / internship email is kept", () => {
  for (const m of JOB) {
    const c = classifyEmail(m);
    assert.equal(c.relevant, true, `should keep: ${m.subject} (${c.reasons.join(",")} score=${c.score})`);
  }
});

test("newsletters, promotions, OTPs, social, digests and personal mail are dropped", () => {
  for (const m of NOT_JOB) {
    const c = classifyEmail(m);
    assert.equal(c.relevant, false, `should drop: ${m.subject} (${c.reasons.join(",")} score=${c.score})`);
  }
});

test("status is inferred from the mail", () => {
  const by = (i) => classifyEmail(JOB[i]).status;
  assert.equal(by(0), "Applied");
  assert.equal(by(1), "Interview");
  assert.equal(by(3), "Interview");
  assert.equal(by(4), "Rejected");
  assert.equal(by(5), "Offer");
});

test("company and role are extracted from subject, snippet and sender", () => {
  assert.equal(classifyEmail(JOB[0]).company, "Acme");
  assert.equal(classifyEmail(JOB[0]).role, "Software Engineer Intern");
  assert.equal(classifyEmail(JOB[2]).company, "Initech");
  assert.equal(classifyEmail(JOB[6]).company, "Umbrella Corp");
  assert.equal(classifyEmail(JOB[6]).role, "Security Analyst");
  assert.equal(extractCompany({ subject: "Interview", snippet: "", from: "Dana <dana@globex.com>" }), "Dana");
  assert.equal(extractCompany({ subject: "Next steps", snippet: "", from: "no-reply@careers.stark-industries.com" }), "Stark Industries");
  assert.equal(extractCompany({ subject: "Next steps", snippet: "", from: "x@gmail.com" }), "");
  assert.equal(extractRole({ subject: "Interview for the Frontend Developer position", snippet: "" }), "Frontend Developer");
});

test("contact email: Reply-To wins; no-reply / ATS / job-board mailboxes are never offered", () => {
  assert.equal(extractContactEmail({ "reply-to": "Recruiter <jane@acme.com>" }, "no-reply@greenhouse.io"), "jane@acme.com");
  assert.equal(extractContactEmail({}, "no-reply@greenhouse.io"), "");
  assert.equal(extractContactEmail({}, "Priya <priya@globex.com>"), "priya@globex.com");
  assert.equal(extractContactEmail({}, "LinkedIn <jobs@linkedin.com>"), "");
});

test("filterJobEmails: counts, thread de-duplication, already-imported skipped, repeats collapsed", () => {
  const a = mail({ id: "m1", threadId: "t1", subject: "Your application to Backend Developer at Acme", from: "Acme <jobs@acme.com>", snippet: "received" });
  const a2 = mail({ id: "m2", threadId: "t1", subject: "Your application to Backend Developer at Acme", from: "Acme <jobs@acme.com>", snippet: "received again" });
  const b = mail({ id: "m3", threadId: "t2", subject: "Your application to Backend Developer at Acme", from: "Acme <jobs@acme.com>", snippet: "resent in another thread" });
  const c = mail({ id: "m4", threadId: "t3", subject: "Interview invitation - QA Engineer", from: "Dev <dev@globex.com>" });
  const imported = mail({ id: "m5", threadId: "t4", subject: "Offer letter - Analyst", from: "HR <hr@x-corp.com>" });
  const { messages, stats } = filterJobEmails([a, a2, b, c, imported, ...NOT_JOB], { importedIds: new Set(["m5"]) });
  assert.deepEqual(messages.map((m) => m.id), ["m1", "m4"]);
  assert.equal(stats.scanned, 5 + NOT_JOB.length);
  assert.equal(stats.relevant, 2);
  assert.equal(stats.skipped.alreadyImported, 1);
  assert.equal(stats.skipped.duplicate, 2);
  assert.ok(stats.skipped.promotional + stats.skipped.transactional + stats.skipped.social + stats.skipped.notJobRelated >= NOT_JOB.length - 1);
  assert.ok(!("headers" in messages[0]) && !("labelIds" in messages[0]));
  assert.equal(messages[0].company, "Acme");
});

test("Gmail query excludes promotions/social/forums/spam and constrains to job signals", () => {
  const q = buildGmailQuery({ days: 14 });
  assert.match(q, /newer_than:14d/);
  for (const bit of ["-category:promotions", "-category:social", "-category:forums", "-in:spam"]) assert.ok(q.includes(bit), bit);
  assert.match(q, /subject:\(/);
  assert.match(q, /from:\(.*greenhouse\.io/);
  assert.match(buildGmailQuery({ days: 99999 }), /newer_than:365d/);
});
