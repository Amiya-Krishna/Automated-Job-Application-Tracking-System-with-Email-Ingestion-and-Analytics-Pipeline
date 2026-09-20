import test from "node:test";
import assert from "node:assert/strict";
import { loadPage, mockChrome, LINKEDIN_HTML, LI_URL } from "./helpers.js";

const ANALYSIS = {
  jobKey: "jd-0123456789abcdef", matchScore: 50,
  requirements: [
    { id: "r1", requirement: "React", state: "MATCHED", label: "Matched" },
    { id: "r2", requirement: "Node.js", state: "PARTIAL_MATCH", label: "Not currently supported by your resume" },
    { id: "r3", requirement: "Docker", state: "NOT_FOUND", label: "Missing / Not found in your profile" },
  ],
};

function setup(handler, html = LINKEDIN_HTML) {
  const chrome = mockChrome(handler);
  const dom = loadPage(html, LI_URL, { scripts: ["jd-extract.js", "tailor-panel.js"], chrome });
  const w = dom.window;
  const opened = [];
  w.open = (...a) => opened.push(a);
  const panel = w.TrackTrailPanel.createPanel({ doc: w.document, chromeApi: chrome, extract: w.TrackTrailExtract, hostname: "www.linkedin.com", sleep: async () => {} });
  panel.open();
  const root = () => panel.host.shadowRoot;
  const btn = (label) => [...root().querySelectorAll("button")].find((b) => b.textContent.startsWith(label));
  const flush = () => new Promise((r) => setTimeout(r, 15));
  return { w, chrome, panel, root, btn, flush, opened };
}

test("panel shows the detected job and the three actions", () => {
  const { root, btn } = setup(() => ({ ok: true }));
  assert.match(root().textContent, /Software Engineer Intern/);
  assert.match(root().textContent, /Acme Corp/);
  for (const l of ["Save Job", "Analyze JD", "Tailor Resume"]) assert.ok(btn(l), l);
});

test("Analyze JD sends the normalised job and renders match %, ✓/⚠/✕ chips and truthful copy", async () => {
  const { chrome, root, btn, flush } = setup((m) => (m.type === "RESUME_ANALYZE" ? { ok: true, analysis: ANALYSIS } : { ok: true }));
  btn("Analyze JD").click();
  await flush();
  const msg = chrome.sent.find((m) => m.type === "RESUME_ANALYZE");
  assert.equal(msg.job.title, "Software Engineer Intern");
  assert.match(msg.job.description, /- Familiarity with Node\.js/);
  const text = root().textContent;
  assert.match(text, /50%/);
  assert.match(text, /✓ React/); assert.match(text, /⚠ Node\.js/); assert.match(text, /✕ Docker/);
  assert.match(text, /never added to it/);
  assert.equal([...root().querySelectorAll(".chip")].find((c) => c.textContent.includes("Docker")).title, "Missing / Not found in your profile");
  assert.equal(msg.job.aws, undefined);
});

test("Tailor Resume: starts a session, shows REAL stages while polling, then links to the review screen", async () => {
  const stages = ["analyzing_jd", "generating", "validating"];
  let i = 0;
  const seenStageText = [];
  const ctx = setup(async (m) => {
    await new Promise((r) => setTimeout(r, 12)); // realistic API latency so intermediate stages are observable
    if (m.type === "RESUME_TAILOR") return { ok: true, session: { id: "s1", status: "queued", stage: "queued" } };
    if (m.type === "RESUME_SESSION") { const s = stages[i++]; return { ok: true, session: s ? { id: "s1", status: "running", stage: s } : { id: "s1", status: "succeeded", stage: "ready", versionId: 42 } }; }
    if (m.type === "RESUME_VERSION") return { ok: true, version: { id: 42, analysis: ANALYSIS, changes: [{}, {}, {}] } };
    if (m.type === "GET_WEB_URL") return { ok: true, url: "https://app.example.com" };
    return { ok: true };
  });
  const obs = setInterval(() => { const a = ctx.root().querySelector("li.active"); if (a) seenStageText.push(a.textContent); }, 1);
  ctx.btn("Tailor Resume").click();
  await new Promise((r) => setTimeout(r, 400));
  clearInterval(obs);
  assert.ok(seenStageText.some((t) => /Generating Tailored Resume/.test(t)), `stages seen: ${seenStageText}`);
  assert.match(ctx.root().textContent, /3 suggested changes are ready\. Nothing is applied until you review them\./);
  ctx.btn("Review in TrackTrail").click();
  await ctx.flush();
  assert.deepEqual(ctx.opened[0], ["https://app.example.com/tailor?version=42", "_blank", "noopener"]);
  // extension never contains review/approval: it hands off to the web app
  assert.ok(!ctx.chrome.sent.some((m) => /APPROVE/i.test(m.type)));
});

test("View Full Analysis opens the cached analysis by key WITHOUT saving the job", async () => {
  const ctx = setup((m) => (m.type === "RESUME_ANALYZE" ? { ok: true, analysis: ANALYSIS } : m.type === "GET_WEB_URL" ? { ok: true, url: "https://app.example.com" } : { ok: true }));
  ctx.btn("Analyze JD").click(); await ctx.flush();
  ctx.btn("View Full Analysis").click(); await ctx.flush();
  assert.equal(ctx.opened[0][0], "https://app.example.com/tailor?analysis=jd-0123456789abcdef");
  assert.ok(!ctx.chrome.sent.some((m) => m.type === "SAVE_JOB"));
});

test("Save Job reuses the original payload and shows duplicate state", async () => {
  const ctx = setup((m) => (m.type === "SAVE_JOB" ? { ok: true, job: { id: 9 }, duplicate: true } : { ok: true }));
  ctx.btn("Save Job").click(); await ctx.flush();
  const m = ctx.chrome.sent.find((x) => x.type === "SAVE_JOB");
  assert.equal(m.job.status, "Applied");
  assert.equal(m.job.sourceName, "linkedin");
  assert.ok(ctx.btn("Already saved"));
});

test("error states: no resume (with CTA), not logged in, JD too short, failed session, AI-free failure", async () => {
  let ctx = setup(() => ({ ok: false, error: "Upload your resume before tailoring.", code: "no_resume" }));
  ctx.btn("Analyze JD").click(); await ctx.flush();
  assert.match(ctx.root().textContent, /Upload your resume before tailoring\./);
  assert.ok(ctx.root().querySelector("a.link"));

  ctx = setup(() => ({ ok: false, error: "Not logged in. Open the extension and sign in first.", code: "not_logged_in" }));
  ctx.btn("Tailor Resume").click(); await ctx.flush();
  assert.match(ctx.root().textContent, /Not logged in/);

  ctx = setup(() => ({ ok: false, error: "The job description does not contain enough information.", code: "jd_too_short" }));
  ctx.btn("Analyze JD").click(); await ctx.flush();
  assert.match(ctx.root().textContent, /does not contain enough information/);

  ctx = setup((m) => (m.type === "RESUME_TAILOR" ? { ok: true, session: { id: "s", status: "queued", stage: "queued" } } : { ok: true, session: { id: "s", status: "failed", error: "None of this job's requirements are supported by your resume.", errorCode: "no_matching_skills" } }));
  ctx.btn("Tailor Resume").click(); await new Promise((r) => setTimeout(r, 40));
  assert.match(ctx.root().textContent, /supported by your resume/);
  assert.ok(ctx.btn("Tailor Resume") && !ctx.btn("Tailor Resume").disabled, "buttons re-enabled after failure");
});

test("SECURITY: hostile page/API text is rendered as text, never as markup", async () => {
  const html = LINKEDIN_HTML.replace("Software Engineer Intern</h1>", `<img src=x onerror="window.pwned=1">Intern</h1>`).replace("Acme Corp", "<script>window.pwned=2</script>Acme");
  const evil = { ...ANALYSIS, requirements: [{ id: "x", requirement: `<img src=x onerror="window.pwned=3">`, state: "MATCHED", label: `"><script>window.pwned=4</script>` }] };
  const ctx = setup((m) => (m.type === "RESUME_ANALYZE" ? { ok: true, analysis: evil } : { ok: false, error: "<b onclick=alert(1)>boom</b>" }), html);
  ctx.btn("Analyze JD").click(); await ctx.flush();
  assert.equal(ctx.root().querySelectorAll("img, script, b").length, 0);
  assert.equal(ctx.w.pwned, undefined);
  assert.match(ctx.root().textContent, /<img src=x/); // shown literally
});

test("panel is isolated in a Shadow DOM and resets when the page navigates", async () => {
  const ctx = setup((m) => (m.type === "RESUME_ANALYZE" ? { ok: true, analysis: ANALYSIS } : { ok: true }));
  assert.equal(ctx.w.document.querySelectorAll(".panel").length, 0, "no styles/markup leak into the host page DOM");
  ctx.btn("Analyze JD").click(); await ctx.flush();
  assert.match(ctx.root().textContent, /50%/);
  ctx.panel.reset();
  assert.doesNotMatch(ctx.root().textContent, /50%/);
  ctx.panel.close();
  assert.equal(ctx.panel.isOpen(), false);
});

test("if the extension was reloaded (invalidated context) the user is told to reload the page", async () => {
  const ctx = setup(() => ({ ok: true }));
  ctx.chrome.runtime.id = undefined;
  ctx.btn("Analyze JD").click(); await ctx.flush();
  assert.match(ctx.root().textContent, /Reload this page/);
});

test("SECURITY: the content-script panel never performs network requests itself (only asks the background worker)", async () => {
  const chrome = mockChrome((m) => {
    if (m.type === "RESUME_ANALYZE") return { ok: true, analysis: ANALYSIS };
    if (m.type === "RESUME_TAILOR") return { ok: true, session: { id: "s", status: "failed", stage: "ready", error: "stop", errorCode: "x" } };
    return { ok: true };
  });
  const dom = loadPage(LINKEDIN_HTML, LI_URL, { scripts: ["jd-extract.js", "tailor-panel.js"], chrome });
  const w = dom.window;
  const attempts = [];
  w.fetch = (...a) => { attempts.push(["fetch", a[0]]); return Promise.reject(new Error("blocked")); };
  w.XMLHttpRequest = function () { attempts.push(["xhr"]); throw new Error("blocked"); };
  w.WebSocket = function () { attempts.push(["ws"]); throw new Error("blocked"); };
  w.navigator.sendBeacon = (...a) => { attempts.push(["beacon", a[0]]); return false; };
  w.open = () => {};
  const panel = w.TrackTrailPanel.createPanel({ doc: w.document, chromeApi: chrome, extract: w.TrackTrailExtract, hostname: "www.linkedin.com", sleep: async () => {} });
  panel.open();
  const btn = (l) => [...panel.host.shadowRoot.querySelectorAll("button")].find((b) => b.textContent.startsWith(l));
  btn("Analyze JD").click();
  await new Promise((r) => setTimeout(r, 20));
  btn("Tailor Resume").click();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(attempts, []);
  assert.ok(chrome.sent.length >= 2, "all work is delegated to the background worker");
});

test("a malformed background reply (no session) is reported, not thrown", async () => {
  const ctx = setup((m) => (m.type === "RESUME_TAILOR" ? { ok: true } : { ok: true }));
  ctx.btn("Tailor Resume").click(); await ctx.flush();
  assert.match(ctx.root().textContent, /Unexpected response/);
  assert.ok(!ctx.btn("Tailor Resume").disabled);
});
