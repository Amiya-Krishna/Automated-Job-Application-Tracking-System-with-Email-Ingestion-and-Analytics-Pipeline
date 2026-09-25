// Resume manager: list / view / choose active / delete, and "tailoring uses the selected resume".
const test = require("node:test");
const assert = require("node:assert/strict");
const { startApp, FakeLlm } = require("./helpers");
const { parseResume } = require("../../services/resumeTailoring/resumeParser");
const {
  exportProfile,
} = require("../../services/resumeTailoring/resumeRenderer");
const fx = require("./fixtures");

const upload = async (app, token, resumeText, name, fmt = "pdf") => {
  const { buffer } = await exportProfile(parseResume(resumeText).profile, fmt);
  const form = new FormData();
  form.append("file", new Blob([buffer]), name);
  return app.call("POST", "/upload", { token, form });
};
async function setup(opts) {
  const app = await startApp(opts);
  app.repo._seedProfile(1, { resume_text: fx.STUDENT_RESUME }); // "Aarav Sharma"
  app.repo._seedProfile(2, {
    resume_text:
      fx.MINIMAL_REACT_RESUME +
      "\nEDUCATION\nB.Tech in Computer Science, Example University\n2022 - 2026\n",
  });
  const job = app.repo._seedTrackedJob(1, {
    company: "Google",
    role: "Software Engineer Intern",
    description: fx.STRUCTURED_JD,
  });
  return { ...app, A: app.tokenFor(1), B: app.tokenFor(2), job };
}
const list = async (app, token) =>
  (await app.call("GET", "/resumes", { token })).data;

test("requires authentication; empty account lists nothing", async (t) => {
  const app = await setup();
  t.after(app.close);
  assert.equal((await app.call("GET", "/resumes")).status, 401);
  assert.equal((await app.call("DELETE", "/resumes/1")).status, 401);
  assert.equal((await app.call("POST", "/resumes/1/activate")).status, 401);
  const empty = await list(app, app.tokenFor(77));
  assert.deepEqual([empty.resumes, empty.activeResumeId], [[], null]);
});

test("the profile-text resume is listed and active by default, with card fields", async (t) => {
  const app = await setup();
  t.after(app.close);
  const l = await list(app, app.A);
  assert.equal(l.resumes.length, 1);
  const r = l.resumes[0];
  assert.deepEqual(
    [r.isActive, r.status, r.fileType, r.sourceType, r.hasFile],
    [true, "active", "text", "profile_text", false],
  );
  assert.ok(r.factsCount >= 20 && r.createdAt && r.name);
  assert.equal(l.activeResumeId, r.id);
});

test("uploaded PDF and DOCX appear (newest active); invalid files are rejected and never listed", async (t) => {
  const app = await setup();
  t.after(app.close);
  const pdf = await upload(app, app.A, fx.RICH_RESUME, "meera.pdf", "pdf");
  const docx = await upload(
    app,
    app.A,
    fx.GLYPHLESS_RESUME +
      "\nPROJECTS\nTodo App\n• Built a todo app with React and Node.js.\n• Added tests with Jest for the API.\n\nEDUCATION\nB.Tech in Computer Science, Example University\n2022 - 2026\n",
    "karan.docx",
    "docx",
  );
  assert.equal(pdf.status, 201);
  assert.equal(docx.status, 201);
  const bad = new FormData();
  bad.append("file", new Blob(["MZ not a pdf".padEnd(300, "x")]), "evil.pdf");
  assert.equal(
    (await app.call("POST", "/upload", { token: app.A, form: bad })).status,
    400,
  );
  const txt = new FormData();
  txt.append("file", new Blob(["hello"]), "notes.txt");
  assert.equal(
    (await app.call("POST", "/upload", { token: app.A, form: txt })).status,
    415,
  );

  const l = await list(app, app.A);
  assert.equal(
    l.resumes.length,
    3,
    "profile text + pdf + docx; the rejected files were not stored",
  );
  const by = Object.fromEntries(
    l.resumes.map((r) => [r.fileName || "profile", r]),
  );
  assert.deepEqual(
    [by["meera.pdf"].fileType, by["karan.docx"].fileType, by.profile.fileType],
    ["pdf", "docx", "text"],
  );
  assert.ok(by["meera.pdf"].hasFile && by["karan.docx"].hasFile);
  assert.equal(
    by["karan.docx"].isActive,
    true,
    "the newest upload is the active resume",
  );
  assert.equal(l.resumes.filter((r) => r.isActive).length, 1);
});

test("'Use for tailoring' switches the active resume, and tailoring really uses it", async (t) => {
  const app = await setup();
  t.after(app.close);
  const meera = (await upload(app, app.A, fx.RICH_RESUME, "meera.pdf")).data
    .resume;
  let l = await list(app, app.A);
  const aarav = l.resumes.find((r) => r.sourceType === "profile_text");
  assert.equal(l.activeResumeId, meera.id);

  const tailor = async (extra = {}) => {
    const s = (
      await app.call("POST", "/tailor?wait=true", {
        token: app.A,
        body: { job: { trackedJobId: app.job.id }, regenerate: true, ...extra },
      })
    ).data;
    assert.equal(s.status, "succeeded", JSON.stringify(s));
    return (await app.call("GET", `/tailored/${s.versionId}`, { token: app.A }))
      .data;
  };
  let v = await tailor();
  assert.equal(v.resumeId, meera.id);
  assert.match(v.resumeText, /Meera Nair/);

  const act = await app.call("POST", `/resumes/${aarav.id}/activate`, {
    token: app.A,
  });
  assert.equal(act.status, 200);
  assert.equal(act.data.activeResumeId, aarav.id);
  v = await tailor();
  assert.equal(v.resumeId, aarav.id, "tailoring follows the active resume");
  assert.match(v.resumeText, /Aarav Sharma/);
  assert.doesNotMatch(v.resumeText, /Meera Nair/);

  // an explicit resumeId (extension's "Select resume for this job") overrides the active one for that job only
  v = await tailor({ resumeId: meera.id });
  assert.equal(v.resumeId, meera.id);
  assert.match(v.resumeText, /Meera Nair/);
  assert.equal(
    (await list(app, app.A)).activeResumeId,
    aarav.id,
    "an explicit per-job choice doesn't change the active resume",
  );

  // analysis is per resume too
  const a1 = (
    await app.call("POST", "/analyze", {
      token: app.A,
      body: { job: { trackedJobId: app.job.id }, resumeId: meera.id },
    })
  ).data;
  const a2 = (
    await app.call("POST", "/analyze", {
      token: app.A,
      body: { job: { trackedJobId: app.job.id }, resumeId: aarav.id },
    })
  ).data;
  assert.equal(a1.resumeId, meera.id);
  assert.equal(a2.resumeId, aarav.id);
  const g = (
    await app.call(
      "GET",
      `/match-analysis/${app.job.id}?resumeId=${meera.id}`,
      { token: app.A },
    )
  ).data;
  assert.equal(g.resumeId, meera.id);
});

test("each resume lists its tailored versions with company, title, date, score and provenance", async (t) => {
  const app = await setup({
    provider: new FakeLlm(() => ({ rewrites: [] }), { name: "gemini" }),
  });
  t.after(app.close);
  const meera = (await upload(app, app.A, fx.RICH_RESUME, "meera.pdf")).data
    .resume;
  const s = (
    await app.call("POST", "/tailor?wait=true", {
      token: app.A,
      body: { job: { trackedJobId: app.job.id }, resumeId: meera.id },
    })
  ).data;
  const l = await list(app, app.A);
  const r = l.resumes.find((x) => x.id === meera.id);
  assert.equal(r.versionCount, 1);
  const v = r.versions[0];
  assert.deepEqual(
    [v.id, v.targetCompany, v.targetTitle, v.resumeId, v.aiProvider],
    [s.versionId, "Google", "Software Engineer Intern", meera.id, "gemini"],
  );
  assert.ok(
    v.createdAt && typeof v.matchScore === "number" && v.status === "draft",
  );
  assert.equal(l.resumes.find((x) => x.id !== meera.id).versionCount, 0);
  // /versions (existing endpoint) carries the same provenance
  const vs = (await app.call("GET", "/versions", { token: app.A })).data
    .versions[0];
  assert.deepEqual([vs.resumeId, vs.aiProvider], [meera.id, "gemini"]);
});

test("GET /resumes/:id returns the parsed resume text for viewing", async (t) => {
  const app = await setup();
  t.after(app.close);
  const meera = (await upload(app, app.A, fx.RICH_RESUME, "meera.pdf")).data
    .resume;
  const d = (await app.call("GET", `/resumes/${meera.id}`, { token: app.A }))
    .data;
  assert.equal(d.resume.id, meera.id);
  assert.match(d.resumeText, /Meera Nair/);
  assert.match(d.resumeText, /Built a React front end/);
  assert.equal(
    (await app.call("GET", "/resumes/99999", { token: app.A })).status,
    404,
  );
  assert.equal(
    (await app.call("GET", "/resumes/abc", { token: app.A })).status,
    400,
  );
});

test("delete: removes uploaded or profile-text resumes without changing profile text", async (t) => {
  const app = await setup();
  t.after(app.close);
  const meera = (await upload(app, app.A, fx.RICH_RESUME, "meera.pdf")).data
    .resume;
  const s = (
    await app.call("POST", "/tailor?wait=true", {
      token: app.A,
      body: { job: { trackedJobId: app.job.id } },
    })
  ).data;
  assert.equal(app.repo._db.versions.length, 1);

  const profileRes = (await list(app, app.A)).resumes.find(
    (r) => r.sourceType === "profile_text",
  );
  const removedProfile = await app.call("DELETE", `/resumes/${profileRes.id}`, {
    token: app.A,
  });
  assert.equal(removedProfile.status, 200);
  assert.equal(removedProfile.data.deleted, true);
  assert.equal(
    app.repo._db.profiles.get(1).resume_text,
    fx.STUDENT_RESUME,
    "profile data is untouched",
  );
  assert.ok(
    removedProfile.data.resumes.every((r) => r.id !== profileRes.id),
    "deleted profile text is not materialized again",
  );

  const del = await app.call("DELETE", `/resumes/${meera.id}`, {
    token: app.A,
  });
  assert.equal(del.status, 200);
  assert.deepEqual([del.data.deleted, del.data.deletedVersions], [true, 1]);
  assert.equal(app.repo._db.versions.length, 0);
  assert.equal(app.repo._db.changes.length, 0);
  assert.equal(del.data.resumes.length, 0);
  assert.equal(del.data.activeResumeId, null);
  assert.equal(
    (await app.call("GET", `/tailored/${s.versionId}`, { token: app.A }))
      .status,
    404,
  );
  assert.equal(
    (
      await app.call("GET", `/original/file?resumeId=${meera.id}`, {
        token: app.A,
      })
    ).status,
    404,
  );
  assert.equal(
    (await app.call("DELETE", `/resumes/${meera.id}`, { token: app.A })).status,
    404,
  );
});

test("deleted profile-text resumes stay deleted until the profile text changes, then regenerate from the new text", async (t) => {
  const app = await setup();
  t.after(app.close);
  const profileRes = (await list(app, app.A)).resumes.find(
    (r) => r.sourceType === "profile_text",
  );
  const removed = await app.call("DELETE", `/resumes/${profileRes.id}`, {
    token: app.A,
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.data.deleted, true);
  assert.equal(
    (await list(app, app.A)).resumes.length,
    0,
    "unchanged profile text does not recreate the deleted resume",
  );

  app.repo._seedProfile(1, {
    resume_text:
      fx.GLYPHLESS_RESUME +
      "\nPROJECTS\nTodo App\n• Built a todo app with React and Node.js.\n• Added tests with Jest for the API.\n\nEDUCATION\nB.Tech in Computer Science, Example University\n2022 - 2026\n",
  });
  const regenerated = await list(app, app.A);
  assert.equal(regenerated.resumes.length, 1);
  assert.equal(regenerated.resumes[0].sourceType, "profile_text");
  assert.notEqual(regenerated.resumes[0].id, profileRes.id);
});

test("AUTHORIZATION: users can't see, activate, delete or tailor with each other's resumes", async (t) => {
  const app = await setup();
  t.after(app.close);
  const meera = (await upload(app, app.A, fx.RICH_RESUME, "meera.pdf")).data
    .resume;
  const lb = await list(app, app.B);
  assert.ok(lb.resumes.every((r) => r.id !== meera.id));
  for (const [m, p] of [
    ["GET", `/resumes/${meera.id}`],
    ["POST", `/resumes/${meera.id}/activate`],
    ["DELETE", `/resumes/${meera.id}`],
    ["GET", `/original/file?resumeId=${meera.id}`],
  ]) {
    assert.equal(
      (await app.call(m, p, { token: app.B })).status,
      404,
      `${m} ${p}`,
    );
  }
  assert.equal(
    (
      await app.call("POST", "/tailor", {
        token: app.B,
        body: { job: { description: fx.STRUCTURED_JD }, resumeId: meera.id },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await app.call("POST", "/analyze", {
        token: app.B,
        body: { job: { description: fx.STRUCTURED_JD }, resumeId: meera.id },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await app.call("GET", `/match-analysis/tracked-1?resumeId=${meera.id}`, {
        token: app.B,
      })
    ).status,
    404,
  );
  assert.ok(
    (await list(app, app.A)).resumes.some((r) => r.id === meera.id),
    "still intact for the owner",
  );
});

test("editing the profile text AFTER choosing a resume makes the newer profile text the one in use (previous behaviour kept)", async (t) => {
  const app = await setup();
  t.after(app.close);
  const meera = (await upload(app, app.A, fx.RICH_RESUME, "meera.pdf")).data
    .resume;
  assert.equal((await list(app, app.A)).activeResumeId, meera.id);
  await new Promise((r) => setTimeout(r, 15));
  app.repo._seedProfile(1, {
    resume_text:
      fx.GLYPHLESS_RESUME +
      "\nPROJECTS\nTodo App\n• Built a todo app with React and Node.js.\n• Added tests with Jest for the API.\n\nEDUCATION\nB.Tech in Computer Science, Example University\n2022 - 2026\n",
  });
  const l = await list(app, app.A);
  const active = l.resumes.find((r) => r.isActive);
  assert.equal(active.sourceType, "profile_text");
  // ...and an explicit choice made later wins again
  await app.call("POST", `/resumes/${meera.id}/activate`, { token: app.A });
  assert.equal((await list(app, app.A)).activeResumeId, meera.id);
});

test("uploading a new resume makes it active even after the user explicitly chose a different one", async (t) => {
  const app = await setup();
  t.after(app.close);
  const first = (await upload(app, app.A, fx.RICH_RESUME, "first.pdf")).data
    .resume;
  const profileRes = (await list(app, app.A)).resumes.find(
    (r) => r.sourceType === "profile_text",
  );
  await app.call("POST", `/resumes/${profileRes.id}/activate`, {
    token: app.A,
  }); // explicit choice: the profile-text resume
  assert.equal((await list(app, app.A)).activeResumeId, profileRes.id);
  const second = (
    await upload(
      app,
      app.A,
      fx.GLYPHLESS_RESUME +
        "\nPROJECTS\nTodo App\n• Built a todo app with React and Node.js.\n• Added tests with Jest for the API.\n\nEDUCATION\nB.Tech in Computer Science, Example University\n2022 - 2026\n",
      "second.docx",
      "docx",
    )
  ).data.resume;
  assert.equal(second.isActive, true);
  assert.equal((await list(app, app.A)).activeResumeId, second.id);
  assert.notEqual(first.id, second.id);
});

test("repo contract: delete/activate are scoped to the owner even if the service check were bypassed", async (t) => {
  const app = await setup();
  t.after(app.close);
  const r = (await upload(app, app.A, fx.RICH_RESUME, "m.pdf")).data.resume;
  assert.deepEqual(await app.repo.deleteResume(2, r.id), {
    deleted: false,
    deletedVersions: 0,
  });
  assert.equal(await app.repo.setActiveResume(2, r.id), null);
  assert.ok(await app.repo.findResumeById(1, r.id));
});
