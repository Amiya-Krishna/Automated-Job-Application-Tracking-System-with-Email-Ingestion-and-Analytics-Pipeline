const test = require("node:test");
const assert = require("node:assert/strict");
const { startApp, FakeLlm, LONG_TAIL } = require("./helpers");
const { AIProvider } = require("../../services/resumeTailoring/providers/base");
const { parseResume } = require("../../services/resumeTailoring/resumeParser");
const { exportProfile } = require("../../services/resumeTailoring/resumeRenderer");
const fx = require("./fixtures");

async function seeded(opts) {
  const app = await startApp(opts);
  app.repo._seedProfile(1, { resume_text: fx.STUDENT_RESUME });
  app.repo._seedProfile(2, { resume_text: fx.MINIMAL_REACT_RESUME + "\nEDUCATION\nB.Tech in Computer Science, Example University\n2022 - 2026\n" });
  const job = app.repo._seedTrackedJob(1, { company: "Google", role: "Software Engineer Intern", description: fx.STRUCTURED_JD, location: "Bengaluru" });
  const A = app.tokenFor(1);
  const B = app.tokenFor(2);
  return { ...app, job, A, B };
}

test("authentication: missing token -> 401, bad token -> 400 (existing middleware behaviour)", async (t) => {
  const app = await seeded(); t.after(app.close);
  assert.equal((await app.call("GET", "/versions")).status, 401);
  assert.equal((await app.call("POST", "/analyze", { body: {} })).status, 401);
  assert.equal((await app.call("GET", "/versions", { token: "garbage" })).status, 400);
});

test("error states: no resume, JD too short, invalid body", async (t) => {
  const app = await seeded(); t.after(app.close);
  const C = app.tokenFor(99); // has no resume
  let r = await app.call("POST", "/analyze", { token: C, body: { job: { description: "x".repeat(300) } } });
  assert.equal(r.status, 422);
  assert.equal(r.data.message, "Upload your resume before tailoring.");
  r = await app.call("POST", "/analyze", { token: app.A, body: { job: { description: "React dev" } } });
  assert.equal(r.status, 422);
  assert.equal(r.data.message, "The job description does not contain enough information.");
  r = await app.call("POST", "/analyze", { token: app.A, body: { job: { description: "x".repeat(300) }, evil: 1 } });
  assert.equal(r.status, 400);
  assert.equal(r.data.code, "invalid_request");
  r = await app.call("POST", "/analyze", { token: app.A, body: { job: {} } });
  assert.equal(r.status, 400);
  r = await app.call("POST", "/analyze", { token: app.A, body: { job: { trackedJobId: "abc" } } });
  assert.equal(r.status, 400);
});

test("analyze: match analysis with evidence, missing skills labelled truthfully, no LLM used", async (t) => {
  const provider = new FakeLlm(() => { throw new Error("analyze must not call the LLM"); });
  const app = await seeded({ provider }); t.after(app.close);
  const r = await app.call("POST", "/analyze", { token: app.A, body: { job: { trackedJobId: app.job.id } } });
  assert.equal(r.status, 200);
  const d = r.data;
  assert.equal(typeof d.matchScore, "number");
  assert.ok(d.missingSkills.includes("Docker") && d.missingSkills.includes("AWS"));
  assert.ok(d.matchedSkills.includes("React"));
  const docker = d.requirements.find((x) => x.requirement === "Docker");
  assert.equal(docker.label, "Missing / Not found in your profile");
  assert.deepEqual(docker.evidence, []);
  assert.ok(d.ats.checks.length >= 6);
  assert.equal(provider.calls.length, 0);
  // second call is served from cache with identical result
  const again = await app.call("POST", "/analyze", { token: app.A, body: { job: { trackedJobId: app.job.id } } });
  assert.equal(again.data.cached, true);
  assert.equal(again.data.matchScore, d.matchScore);
  assert.equal(app.repo._db.analyses.length, 1);
  // GET by job key
  const g = await app.call("GET", `/match-analysis/${app.job.id}`, { token: app.A });
  assert.equal(g.status, 200);
  assert.equal(g.data.matchScore, d.matchScore);
  assert.equal((await app.call("GET", "/match-analysis/..%2Fetc", { token: app.A })).status, 400);
});

test("full flow: tailor -> versions -> review -> approve -> export; original never modified", async (t) => {
  const app = await seeded(); t.after(app.close);
  // a resume where many things can be improved, so review semantics are actually exercised
  app.repo._seedProfile(1, { resume_text: fx.RICH_RESUME });
  const before = JSON.stringify(await app.repo.getProfileRow(1));

  const s = await app.call("POST", "/tailor?wait=true", { token: app.A, body: { job: { trackedJobId: app.job.id } } });
  assert.equal(s.status, 200);
  assert.equal(s.data.status, "succeeded");
  assert.equal(s.data.stage, "ready");
  const v = (await app.call("GET", `/tailored/${s.data.versionId}`, { token: app.A })).data;
  assert.equal(v.status, "draft");
  assert.equal(v.targetCompany, "Google");
  assert.equal(v.label, "Software Engineer Intern - Google");
  assert.ok(v.changes.length >= 4, `need several changes to exercise review, got ${v.changes.length}`);
  assert.ok(new Set(v.changes.map((c) => c.section)).size >= 3, "changes span skills/projects/experience");
  for (const c of v.changes) {
    assert.ok(c.reason && c.original && c.proposed && c.id);
    assert.ok(c.evidence.length > 0, "every change is traceable to source facts");
    assert.doesNotMatch(c.reason, /added (AWS|Docker)/i);
  }
  assert.doesNotMatch(v.resumeText, /\bAWS\b|\bDocker\b|Kubernetes/);

  // original untouched
  assert.equal(JSON.stringify(await app.repo.getProfileRow(1)), before);
  assert.equal(app.repo._db.resumes.length, 1);

  // export blocked until approval
  const early = await app.call("POST", `/versions/${v.id}/export`, { token: app.A, body: { format: "txt" } });
  assert.equal(early.status, 409);

  // preview with everything rejected == original resume
  const rejectAll = Object.fromEntries(v.changes.map((c) => [c.id, "rejected"]));
  const pv = (await app.call("POST", `/versions/${v.id}/preview`, { token: app.A, body: { decisions: rejectAll } })).data;
  const original = parseResume(fx.RICH_RESUME).profile;
  assert.deepEqual(pv.profile.projects.map((p) => p.id), original.projects.map((p) => p.id));
  assert.deepEqual(pv.profile.skills, original.skills);
  // ...and with everything pending, the preview differs from the original (changes are real)
  const pvAll = (await app.call("POST", `/versions/${v.id}/preview`, { token: app.A, body: {} })).data;
  assert.notDeepEqual(pvAll.profile.projects.map((p) => p.id), original.projects.map((p) => p.id));

  // review: accept only the first change
  const first = v.changes[0].id;
  const ap = await app.call("POST", `/versions/${v.id}/approve`, { token: app.A, body: { action: "review", decisions: { [first]: "accepted" } } });
  assert.equal(ap.status, 200);
  assert.equal(ap.data.status, "approved");
  assert.equal(ap.data.changes.filter((c) => c.status === "accepted").length, 1);
  assert.equal(ap.data.changes.filter((c) => c.status === "rejected").length, v.changes.length - 1, "undecided changes are NOT applied");
  assert.ok(ap.data.approvedAt);
  // approving twice is refused
  assert.equal((await app.call("POST", `/versions/${v.id}/approve`, { token: app.A, body: { action: "accept_all" } })).status, 409);

  // list: original + this version
  const list = (await app.call("GET", "/versions", { token: app.A })).data;
  assert.equal(list.original.id, "original");
  assert.equal(list.versions.length, 1);
  assert.equal(list.versions[0].acceptedCount, 1);

  // export
  for (const [fmt, sig] of [["txt", null], ["md", null], ["html", null], ["pdf", "%PDF"], ["docx", "PK"]]) {
    const ex = await app.call("POST", `/versions/${v.id}/export`, { token: app.A, body: { format: fmt } });
    assert.equal(ex.status, 200, fmt);
    assert.match(ex.headers.get("content-disposition"), /attachment; filename="Meera_Nair_Google_Software_Engineer_Intern\.\w+"/);
    assert.equal(ex.headers.get("x-content-type-options"), "nosniff");
    if (sig) assert.equal(ex.data.subarray(0, sig.length).toString(), sig);
    else assert.match(ex.data.toString(), /Meera Nair/);
  }
  assert.equal((await app.call("POST", `/versions/${v.id}/export`, { token: app.A, body: { format: "exe" } })).status, 400);
  // the untouched original is always exportable
  const orig = await app.call("POST", "/versions/original/export", { token: app.A, body: { format: "txt" } });
  assert.equal(orig.status, 200);
  assert.match(orig.data.toString(), /Frontend Intern/);
});

test("accept_all / reject_all work; reject_all leaves the original resume", async (t) => {
  const app = await seeded(); t.after(app.close);
  app.repo._seedProfile(1, { resume_text: fx.RICH_RESUME });
  const mk = async () => (await app.call("POST", "/tailor?wait=true", { token: app.A, body: { job: { trackedJobId: app.job.id }, regenerate: true } })).data.versionId;
  const v1 = await mk();
  const acc = (await app.call("POST", `/versions/${v1}/approve`, { token: app.A, body: { action: "accept_all" } })).data;
  assert.ok(acc.changes.every((c) => c.status === "accepted"));
  const v2 = await mk();
  const rej = (await app.call("POST", `/versions/${v2}/approve`, { token: app.A, body: { action: "reject_all" } })).data;
  assert.equal(rej.status, "rejected");
  assert.ok(rej.changes.every((c) => c.status === "rejected"));
  assert.equal(rej.resumeText.includes("Meera Nair"), true);
  assert.equal(rej.resumeText, require("../../services/resumeTailoring/resumeRenderer").toText(parseResume(fx.RICH_RESUME).profile), "reject_all == the original, byte for byte");
  assert.ok(acc.resumeText !== rej.resumeText, "accept_all actually changes the resume");
  assert.equal((await app.call("POST", `/versions/${v2}/export`, { token: app.A, body: { format: "txt" } })).status, 200); // rejected == original content
  const unk = await app.call("POST", `/versions/${(await mk())}/approve`, { token: app.A, body: { action: "review", decisions: { chg_999: "accepted" } } });
  assert.equal(unk.status, 400);
});

test("AUTHORIZATION: another user can never read, preview, approve, export or poll someone else's data", async (t) => {
  const app = await seeded(); t.after(app.close);
  const s = (await app.call("POST", "/tailor?wait=true", { token: app.A, body: { job: { trackedJobId: app.job.id } } })).data;
  const vid = s.versionId;
  const other = [
    ["GET", `/tailored/${vid}`],
    ["POST", `/versions/${vid}/preview`, {}],
    ["POST", `/versions/${vid}/approve`, { action: "accept_all" }],
    ["POST", `/versions/${vid}/export`, { format: "txt" }],
    ["GET", `/sessions/${s.id}`],
  ];
  for (const [m, p, body] of other) {
    const r = await app.call(m, p, { token: app.B, body });
    assert.equal(r.status, 404, `${m} ${p} leaked to another user`);
  }
  // A's tracked job is invisible to B, in analyze/tailor/match-analysis
  assert.equal((await app.call("POST", "/analyze", { token: app.B, body: { job: { trackedJobId: app.job.id } } })).status, 404);
  assert.equal((await app.call("POST", "/tailor", { token: app.B, body: { job: { trackedJobId: app.job.id } } })).status, 404);
  assert.equal((await app.call("GET", `/match-analysis/${app.job.id}`, { token: app.B })).status, 404);
  // B cannot use A's resume id
  const aResume = app.repo._db.resumes[0].id;
  assert.equal((await app.call("POST", "/analyze", { token: app.B, body: { job: { description: fx.STRUCTURED_JD }, resumeId: aResume } })).status, 404);
  // B's version list is empty
  const bl = (await app.call("GET", "/versions", { token: app.B })).data;
  assert.equal(bl.versions.length, 0);
  // A still has access
  assert.equal((await app.call("GET", `/tailored/${vid}`, { token: app.A })).status, 200);
});

test("cost control: re-tailoring the same job+resume reuses the version; regenerate creates a new one", async (t) => {
  const provider = new FakeLlm(() => ({ rewrites: [] }));
  const app = await seeded({ provider }); t.after(app.close);
  const a = (await app.call("POST", "/tailor?wait=true", { token: app.A, body: { job: { trackedJobId: app.job.id } } })).data;
  const callsAfterFirst = provider.calls.length;
  const b = (await app.call("POST", "/tailor?wait=true", { token: app.A, body: { job: { trackedJobId: app.job.id } } })).data;
  assert.equal(b.versionId, a.versionId);
  assert.equal(provider.calls.length, callsAfterFirst, "no extra LLM calls for a cached result");
  assert.equal(app.repo._db.versions.length, 1);
  const c = (await app.call("POST", "/tailor?wait=true", { token: app.A, body: { job: { trackedJobId: app.job.id }, regenerate: true } })).data;
  assert.notEqual(c.versionId, a.versionId);
  assert.equal(app.repo._db.versions.length, 2);
  assert.equal(app.repo._db.resumes.length, 1, "the resume is parsed once and reused");
});

test("ad-hoc JD (extension/pasted) works and records a JD snapshot hash", async (t) => {
  const app = await seeded(); t.after(app.close);
  const body = { job: { title: "Frontend Intern", company: "Acme", description: fx.SAFETY_JD + LONG_TAIL, sourceUrl: "https://example.com/jobs/1", sourceName: "extension" } };
  const s = (await app.call("POST", "/tailor?wait=true", { token: app.A, body })).data;
  assert.equal(s.status, "succeeded");
  const v = (await app.call("GET", `/tailored/${s.versionId}`, { token: app.A })).data;
  assert.match(v.jdHash, /^[a-f0-9]{64}$/);
  assert.match(v.jobKey, /^jd-[a-f0-9]{16}$/);
  assert.equal(app.repo._db.jds.length, 1);
  assert.ok(app.repo._db.jds[0].rawText.includes("Requirements"), "original JD is stored for verification");
});

test("no matching skills: no misleading tailoring is generated", async (t) => {
  const app = await seeded(); t.after(app.close);
  const jd = "Machine Learning Engineer\nRequirements\n- PyTorch\n- TensorFlow\n- Spark\n- Airflow\n" + LONG_TAIL;
  const s = (await app.call("POST", "/tailor?wait=true", { token: app.A, body: { job: { title: "ML Eng", company: "X", description: jd } } })).data;
  assert.equal(s.status, "failed");
  assert.equal(s.errorCode, "no_matching_skills");
  assert.equal(app.repo._db.versions.length, 0);
  // analysis still works and shows what's missing
  const a = (await app.call("POST", "/analyze", { token: app.A, body: { job: { title: "ML Eng", company: "X", description: jd } } })).data;
  assert.ok(a.missingSkills.includes("PyTorch"));
});

test("async sessions expose real stages and block concurrent runs", async (t) => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const provider = new FakeLlm(async () => { await gate; return { rewrites: [] }; });
  const app = await seeded({ provider }); t.after(app.close);
  const s = await app.call("POST", "/tailor", { token: app.A, body: { job: { trackedJobId: app.job.id } } });
  assert.equal(s.status, 202);
  await new Promise((r) => setTimeout(r, 60));
  const mid = (await app.call("GET", `/sessions/${s.data.id}`, { token: app.A })).data;
  assert.equal(mid.status, "running");
  assert.equal(mid.stage, "generating");
  assert.equal(mid.stageLabel, "Generating Tailored Resume…");
  const second = await app.call("POST", "/tailor", { token: app.A, body: { job: { trackedJobId: app.job.id } } });
  assert.equal(second.status, 409);
  release();
  let done;
  for (let i = 0; i < 50; i += 1) { done = (await app.call("GET", `/sessions/${s.data.id}`, { token: app.A })).data; if (done.status !== "running") break; await new Promise((r) => setTimeout(r, 20)); }
  assert.equal(done.status, "succeeded");
  assert.equal(done.stageLabel, "Resume Ready");
});

test("LLM outage is reported but the user still gets safe deterministic suggestions", async (t) => {
  const app = await seeded({ provider: new FakeLlm(() => { throw new Error("upstream 503"); }) }); t.after(app.close);
  const s = (await app.call("POST", "/tailor?wait=true", { token: app.A, body: { job: { trackedJobId: app.job.id } } })).data;
  assert.equal(s.status, "succeeded");
  assert.ok(s.warnings.some((w) => /unavailable/i.test(w)));
  const v = (await app.call("GET", `/tailored/${s.versionId}`, { token: app.A })).data;
  assert.equal(v.aiUsed, false);
});

test("hostile model through the full API: rejected claims are surfaced, never applied", async (t) => {
  const evil = new FakeLlm(({ units }) => ({ rewrites: units.map((u) => ({ unitId: u.id, proposed: `${u.text} Deployed on AWS with Docker and Kubernetes for 1M users.` })) }));
  const app = await seeded({ provider: evil }); t.after(app.close);
  const s = (await app.call("POST", "/tailor?wait=true", { token: app.A, body: { job: { trackedJobId: app.job.id } } })).data;
  const v = (await app.call("GET", `/tailored/${s.versionId}`, { token: app.A })).data;
  assert.ok(v.unsupportedClaims.length > 0);
  assert.equal(v.changes.filter((c) => c.source === "ai").length, 0);
  const ap = (await app.call("POST", `/versions/${v.id}/approve`, { token: app.A, body: { action: "accept_all" } })).data;
  assert.doesNotMatch(ap.resumeText, /AWS|Docker|Kubernetes|1M/);
});

test("rate limiting returns 429 with Retry-After", async (t) => {
  process.env.RESUME_RL_ANALYZE = "2";
  const app = await seeded(); t.after(async () => { delete process.env.RESUME_RL_ANALYZE; await app.close(); });
  const body = { job: { trackedJobId: app.job.id } };
  assert.equal((await app.call("POST", "/analyze", { token: app.A, body })).status, 200);
  assert.equal((await app.call("POST", "/analyze", { token: app.A, body })).status, 200);
  const r = await app.call("POST", "/analyze", { token: app.A, body });
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get("retry-after")) >= 1);
  // limits are per user
  assert.equal((await app.call("POST", "/analyze", { token: app.B, body: { job: { description: fx.STRUCTURED_JD } } })).status, 200);
});

test("upload: valid PDF/DOCX accepted and stored; hostile/invalid files rejected; original file downloadable", async (t) => {
  const app = await seeded(); t.after(app.close);
  const { profile } = parseResume(fx.GLYPHLESS_RESUME + "\nPROJECTS\nTodo App\n• Built a todo app with React and Node.js.\n• Added tests with Jest for the API.\n\nEDUCATION\nB.Tech in Computer Science, Example University\n2022 - 2026\n");
  const { buffer } = await exportProfile(profile, "pdf");
  const send = (buf, name, type, extra = {}) => {
    const form = new FormData();
    form.append("file", new Blob([buf], { type }), name);
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    return app.call("POST", "/upload", { token: app.tokenFor(7), form });
  };
  const ok = await send(buffer, "my resume.pdf", "application/pdf", { syncProfile: "true" });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.resume.hasFile, true);
  assert.equal(ok.data.syncedToProfile, true);
  assert.equal(ok.data.resume.fileName, "my resume.pdf");
  assert.match((await app.repo.getProfileRow(7)).resume_text, /Karan Mehta/);
  const cur = (await app.call("GET", "/current", { token: app.tokenFor(7) })).data;
  assert.equal(cur.resume.id, ok.data.resume.id);
  const dl = await app.call("GET", "/original/file", { token: app.tokenFor(7) });
  assert.equal(dl.status, 200);
  assert.deepEqual(Buffer.from(dl.data), buffer);
  assert.equal((await app.call("GET", "/original/file", { token: app.B })).status, 404); // other user has no file
  // hostile / invalid
  assert.equal((await send(Buffer.from("MZ not a pdf".padEnd(400, "x")), "evil.pdf", "application/pdf")).status, 400);
  assert.equal((await send(Buffer.from("hello world"), "notes.txt", "text/plain")).status, 415);
  assert.equal((await send(Buffer.alloc(3 * 1024 * 1024, 1), "big.pdf", "application/pdf")).status, 413);
  assert.equal((await app.call("POST", "/upload", { token: app.A, form: new FormData() })).status, 400);
  // DOCX works too
  const docx = (await exportProfile(profile, "docx")).buffer;
  assert.equal((await send(docx, "resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).status, 201);
});

test("upload does not overwrite profile text unless explicitly asked", async (t) => {
  const app = await seeded(); t.after(app.close);
  const { profile } = parseResume(fx.STUDENT_RESUME);
  const { buffer } = await exportProfile(profile.constructor === Object ? profile : profile, "pdf");
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "application/pdf" }), "r.pdf");
  const before = (await app.repo.getProfileRow(2)).resume_text;
  const r = await app.call("POST", "/upload", { token: app.B, form });
  assert.equal(r.status, 201);
  assert.equal((await app.repo.getProfileRow(2)).resume_text, before);
});

test("DEFENCE IN DEPTH: even if the provider's own validator is compromised, final verification blocks fabricated text", async (t) => {
  class Compromised extends FakeLlm {
    validateTailoring() { return { ok: true, violations: [] }; } // rubber-stamps everything
  }
  const evil = new Compromised(({ units }) => ({ rewrites: units.map((u) => ({ unitId: u.id, proposed: "Built React applications on AWS with Docker for 1M users." })) }));
  const app = await seeded({ provider: evil }); t.after(app.close);
  app.repo._seedProfile(1, { resume_text: fx.RICH_RESUME });
  const s = (await app.call("POST", "/tailor?wait=true", { token: app.A, body: { job: { trackedJobId: app.job.id } } })).data;
  assert.equal(s.status, "succeeded");
  const v = (await app.call("GET", `/tailored/${s.versionId}`, { token: app.A })).data;
  assert.equal(v.changes.filter((c) => c.source === "ai").length, 0, "AI changes were dropped by the final check");
  assert.ok(v.unsupportedClaims.length > 0, "and recorded as unsupported claims");
  assert.doesNotMatch(v.resumeText, /AWS|Docker|1M/);
  const ap = (await app.call("POST", `/versions/${v.id}/approve`, { token: app.A, body: { action: "accept_all" } })).data;
  assert.doesNotMatch(ap.resumeText, /AWS|Docker|1M/);
});
