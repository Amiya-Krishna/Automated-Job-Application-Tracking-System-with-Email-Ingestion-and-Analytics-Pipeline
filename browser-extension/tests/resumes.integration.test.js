// Extension "My Resumes" — REAL dashboard.html markup + REAL manager + REAL API client,
// talking over HTTP to the REAL Express routes / tailoring pipeline (in-memory repo).
// Nothing about resumes is mocked between the click and the backend.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { createResumeManager } from "../resume-manager.js";
import { createResumeApi } from "../resume-api.js";

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const server = path.resolve(dir, "../../server");
const { startApp } = require(path.join(server, "tests/resumeTailoring/helpers.js"));
const fx = require(path.join(server, "tests/resumeTailoring/fixtures.js"));
const { exportProfile } = require(path.join(server, "services/resumeTailoring/resumeRenderer.js"));
const { parseResume } = require(path.join(server, "services/resumeTailoring/resumeParser.js"));

const DASH_HTML = readFileSync(path.join(dir, "../dashboard.html"), "utf8");
const tick = (ms = 25) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await tick(15); } throw new Error("timed out waiting for the UI"); };
const file = async (text, name, fmt) => new File([(await exportProfile(parseResume(text).profile, fmt)).buffer], name);

async function boot({ token = true } = {}) {
  const app = await startApp();
  app.repo._seedProfile(1, { resume_text: fx.STUDENT_RESUME }); // "Aarav Sharma" — the profile-text resume
  const job = app.repo._seedTrackedJob(1, { company: "Google", role: "Software Engineer Intern", description: fx.STRUCTURED_JD });
  const tok = app.tokenFor(1);
  const requests = [];
  const fetchImpl = (url, init) => { requests.push({ url, init }); return fetch(url, init); };
  const chromeApi = { storage: { local: { get: async (k) => ({ token: token ? tok : undefined, apiBaseUrl: `${app.origin}/api`, webAppUrl: "https://app.example.com" }) } } };
  const dom = new JSDOM(DASH_HTML, { url: "chrome-extension://abc/dashboard.html" }); // real markup; its script is NOT run
  const doc = dom.window.document;
  const saved = []; const opened = []; let confirmAnswer = true; const confirmed = [];
  const api = createResumeApi({ chromeApi, fetchImpl, defaultApiBaseUrl: "http://unused.example/api" });
  const manager = createResumeManager({ doc, api, saveBlob: (b, n) => saved.push([b, n]), openWeb: (p) => opened.push(p), confirmFn: (m) => { confirmed.push(m); return confirmAnswer; }, formatDate: (d) => new Date(d).toISOString().slice(0, 10) });
  const pick = async (f) => { const input = doc.getElementById("resumeFileInput"); Object.defineProperty(input, "files", { value: [f], configurable: true }); input.dispatchEvent(new dom.window.Event("change")); };
  const cards = () => [...doc.querySelectorAll(".resumeCard")];
  const cardBy = (name) => cards().find((c) => c.querySelector(".resumeName").textContent === name);
  const button = (root, label) => [...root.querySelectorAll("button")].find((b) => b.textContent.startsWith(label));
  return { app, job, tok, requests, doc, dom, manager, api, saved, opened, confirmed, setConfirm: (v) => { confirmAnswer = v; }, pick, cards, cardBy, button, text: () => doc.getElementById("resumesList").textContent, msg: () => doc.getElementById("resumesMsg").textContent, err: () => doc.getElementById("resumesError").textContent };
}

test("the real dashboard has a 'My Resumes' sidebar item with an icon, and its section", () => {
  const dom = new JSDOM(DASH_HTML);
  const item = dom.window.document.querySelector('[data-tab="resumesTab"]');
  assert.ok(item);
  assert.equal(item.querySelector("span").textContent, "My Resumes");
  assert.ok(item.querySelector("svg.nav-icon"));
  assert.ok(dom.window.document.getElementById("resumesTab").classList.contains("dashPanel"));
  for (const id of ["resumeUploadBtn", "resumeFileInput", "resumesList", "resumesEmpty", "resumeViewer"]) assert.ok(dom.window.document.getElementById(id), id);
  assert.match(dom.window.document.getElementById("resumeFileInput").getAttribute("accept"), /\.pdf.*\.docx/);
});

test("loads the account's resumes from the BACKEND: the profile-text resume is listed and active", async (t) => {
  const c = await boot(); t.after(c.app.close);
  assert.equal(c.doc.getElementById("resumesEmpty").classList.contains("hidden"), true);
  await c.manager.load();
  assert.equal(c.cards().length, 1);
  const card = c.cards()[0];
  assert.match(card.textContent, /Resume from profile text/);
  assert.match(card.textContent, /Profile text/);
  assert.match(card.textContent, /Active/);
  assert.match(card.textContent, /Uploaded \d{4}-\d{2}-\d{2}/);
  for (const label of ["View", "In use for tailoring", "Versions", "Delete"]) assert.ok(c.button(card, label), label);
  assert.equal(c.button(card, "Delete").disabled, true, "the profile-text resume can't be deleted here");
  assert.ok(c.requests.every((r) => r.url.startsWith(`${c.app.origin}/api/resume/`)), "only the TrackTrail API is contacted");
});

test("upload PDF + DOCX through the UI; they appear as cards from the backend (newest active)", async (t) => {
  const c = await boot(); t.after(c.app.close);
  await c.manager.load();
  await c.pick(await file(fx.RICH_RESUME, "meera-cv.pdf", "pdf"));
  await until(() => c.cards().length === 2);
  assert.match(c.msg(), /Uploaded “meera-cv\.pdf”/);
  await c.pick(await file(fx.GLYPHLESS_RESUME + "\nPROJECTS\nTodo App\n• Built a todo app with React and Node.js.\n• Added tests with Jest for the API.\n\nEDUCATION\nB.Tech in Computer Science, Example University\n2022 - 2026\n", "karan-cv.docx", "docx"));
  await until(() => c.cards().length === 3);
  const pdf = c.cardBy("meera-cv.pdf"); const docx = c.cardBy("karan-cv.docx");
  assert.match(pdf.textContent, /PDF/); assert.match(docx.textContent, /DOCX/);
  assert.match(docx.textContent, /Active/); assert.doesNotMatch(pdf.querySelector(".resumeBadges").textContent, /Active/);
  // the multipart upload really reached the backend, with a browser-style multipart content type
  const up = c.requests.filter((r) => r.url.endsWith("/resume/upload"));
  assert.equal(up.length, 2);
  for (const r of up) { assert.ok(r.init.body instanceof FormData); assert.equal(r.init.headers["Content-Type"], undefined, "never set the multipart content type by hand"); assert.ok(r.init.headers.token); }
  // stored by the backend (not in the extension)
  assert.equal(c.app.repo._db.resumes.length, 3);
  assert.ok(c.app.repo._db.resumes.filter((r) => r.fileData).length === 2);
});

test("invalid files are rejected: client hint for obvious cases, the backend for hostile ones; nothing is stored", async (t) => {
  const c = await boot(); t.after(c.app.close);
  await c.manager.load();
  await c.pick(new File(["hello"], "notes.txt")); await tick();
  assert.match(c.err(), /Only PDF and DOCX/);
  await c.pick(new File(["MZ\x90 not a pdf".padEnd(400, "x")], "evil.pdf")); // passes the extension check; the BACKEND magic-byte check rejects it
  await until(() => /not a valid PDF/.test(c.err()));
  await c.pick(new File([Buffer.alloc(3 * 1024 * 1024, 1)], "big.pdf")); await tick();
  assert.match(c.err(), /too large/);
  await c.pick(new File([], "empty.pdf")); await tick();
  assert.match(c.err(), /empty/);
  assert.equal(c.cards().length, 1);
  assert.equal(c.app.repo._db.resumes.length, 1);
  assert.equal(c.requests.filter((r) => r.url.endsWith("/upload")).length, 1, "only the hostile file that passed the client hint hit the backend");
});

test("'Use for Tailoring' changes the active resume on the backend, and tailoring then uses it", async (t) => {
  const c = await boot(); t.after(c.app.close);
  await c.manager.load();
  await c.pick(await file(fx.RICH_RESUME, "meera-cv.pdf", "pdf")); await until(() => c.cards().length === 2);
  const profileCard = c.cardBy("Resume from profile text");
  c.button(profileCard, "Use for Tailoring").click();
  await until(() => /will now be used for tailoring/.test(c.msg()));
  assert.match(c.cardBy("Resume from profile text").querySelector(".resumeBadges").textContent, /Active/);
  assert.equal(c.button(c.cardBy("Resume from profile text"), "In use for tailoring").disabled, true);
  const s = (await c.app.call("POST", "/tailor?wait=true", { token: c.tok, body: { job: { trackedJobId: c.job.id } } })).data;
  assert.match((await c.app.call("GET", `/tailored/${s.versionId}`, { token: c.tok })).data.resumeText, /Aarav Sharma/);
});

test("Versions: the original + tailored versions with company, title, date, score and provenance; Preview and Export work", async (t) => {
  const c = await boot(); t.after(c.app.close);
  await c.manager.load();
  await c.pick(await file(fx.RICH_RESUME, "meera-cv.pdf", "pdf")); await until(() => c.cards().length === 2);
  const s = (await c.app.call("POST", "/tailor?wait=true", { token: c.tok, body: { job: { trackedJobId: c.job.id } } })).data;
  await c.manager.load();
  const card = c.cardBy("meera-cv.pdf");
  assert.match(c.button(card, "Versions").textContent, /Versions \(1\)/);
  c.button(card, "Versions").click();
  const panel = c.cardBy("meera-cv.pdf").querySelector(".resumeVersions");
  assert.ok(panel);
  assert.match(panel.textContent, /Original Resume/);
  assert.match(panel.textContent, /Uploaded \d{4}-\d{2}-\d{2} · \d+ facts parsed · Current \/ active/);
  const row = panel.querySelector(".resumeVersion");
  assert.match(row.querySelector(".resumeVersionTitle").textContent, /Software Engineer Intern — Google/);
  assert.match(row.textContent, /Created \d{4}-\d{2}-\d{2}/);
  assert.match(row.textContent, /Match \d+%/);
  assert.match(row.textContent, /Reorder-only \(no AI\)/);
  for (const l of ["View", "Preview", "Export"]) assert.ok(c.button(row, l), l);
  // View -> web app
  c.button(row, "View").click();
  assert.deepEqual(c.opened, [`/tailor?version=${s.versionId}`]);
  // Preview -> the tailored text from the backend
  c.button(row, "Preview").click();
  await until(() => !c.doc.getElementById("resumeViewer").classList.contains("hidden"));
  assert.match(c.doc.getElementById("resumeViewerTitle").textContent, /Software Engineer Intern — Google/);
  assert.match(c.doc.getElementById("resumeViewerBody").textContent, /Meera Nair/);
  c.doc.getElementById("resumeViewerClose").click();
  assert.ok(c.doc.getElementById("resumeViewer").classList.contains("hidden"));
  // Export of an unapproved draft is refused by the backend and explained
  c.button(c.cardBy("meera-cv.pdf").querySelector(".resumeVersion"), "Export").click();
  await until(() => /approve/i.test(c.err()));
  assert.equal(c.saved.length, 0);
  // after approval, export downloads a real file
  await c.app.call("POST", `/versions/${s.versionId}/approve`, { token: c.tok, body: { action: "accept_all" } });
  const sel = c.cardBy("meera-cv.pdf").querySelector(".exportSelect"); sel.value = "txt";
  c.button(c.cardBy("meera-cv.pdf").querySelector(".resumeVersion"), "Export").click();
  await until(() => c.saved.length === 1);
  const [blob, name] = c.saved[0];
  assert.match(name, /^Meera_Nair_Google_Software_Engineer_Intern\.txt$/);
  assert.match(await blob.text(), /Meera Nair/);
});

test("View shows the parsed resume; Download original returns the exact uploaded file", async (t) => {
  const c = await boot(); t.after(c.app.close);
  await c.manager.load();
  const f = await file(fx.RICH_RESUME, "meera-cv.pdf", "pdf");
  const original = Buffer.from(await f.arrayBuffer());
  await c.pick(f); await until(() => c.cards().length === 2);
  c.button(c.cardBy("meera-cv.pdf"), "View").click();
  await until(() => !c.doc.getElementById("resumeViewer").classList.contains("hidden"));
  assert.match(c.doc.getElementById("resumeViewerBody").textContent, /Built a React front end/);
  c.button(c.doc.getElementById("resumeViewerActions"), "Download original").click();
  await until(() => c.saved.length === 1);
  assert.equal(c.saved[0][1], "meera-cv.pdf");
  assert.deepEqual(Buffer.from(await c.saved[0][0].arrayBuffer()), original);
});

test("Delete asks for confirmation, removes the resume AND its versions on the backend", async (t) => {
  const c = await boot(); t.after(c.app.close);
  await c.manager.load();
  await c.pick(await file(fx.RICH_RESUME, "meera-cv.pdf", "pdf")); await until(() => c.cards().length === 2);
  await c.app.call("POST", "/tailor?wait=true", { token: c.tok, body: { job: { trackedJobId: c.job.id } } });
  await c.manager.load();
  c.setConfirm(false);
  c.button(c.cardBy("meera-cv.pdf"), "Delete").click(); await tick();
  assert.match(c.confirmed[0], /Delete “meera-cv\.pdf”\? This also deletes its 1 tailored version\./);
  assert.equal(c.cards().length, 2, "declined -> nothing deleted");
  c.setConfirm(true);
  c.button(c.cardBy("meera-cv.pdf"), "Delete").click();
  await until(() => c.cards().length === 1);
  assert.match(c.msg(), /Deleted “meera-cv\.pdf” and 1 tailored version/);
  assert.equal(c.app.repo._db.versions.length, 0);
  assert.equal(c.app.repo._db.resumes.length, 1);
});

test("SAME records everywhere: what the extension shows is exactly what the web/mobile API returns; no extension-local storage", async (t) => {
  const c = await boot(); t.after(c.app.close);
  await c.manager.load();
  await c.pick(await file(fx.RICH_RESUME, "meera-cv.pdf", "pdf")); await until(() => c.cards().length === 2);
  const fromApi = (await c.app.call("GET", "/resumes", { token: c.tok })).data; // the very endpoint web + mobile use
  const shown = c.cards().map((card) => card.querySelector(".resumeName").textContent).sort();
  assert.deepEqual(shown, fromApi.resumes.map((r) => r.name).sort());
  assert.equal(c.manager.state.data.activeResumeId, fromApi.activeResumeId);
  // a resume added "elsewhere" (e.g. the web client) shows up in the extension after a refresh — the backend is the source of truth
  const { buffer } = await exportProfile(parseResume(fx.GLYPHLESS_RESUME + "\nPROJECTS\nTodo App\n• Built a todo app with React and Node.js.\n• Added tests with Jest for the API.\n\nEDUCATION\nB.Tech in Computer Science, Example University\n2022 - 2026\n").profile, "docx");
  const form = new FormData(); form.append("file", new Blob([buffer]), "from-web.docx");
  assert.equal((await c.app.call("POST", "/upload", { token: c.tok, form })).status, 201);
  c.doc.getElementById("resumesRefresh").click();
  await until(() => c.cards().length === 3 && c.cardBy("from-web.docx"));
  const source = readFileSync(path.join(dir, "../resume-manager.js"), "utf8") + readFileSync(path.join(dir, "../resume-api.js"), "utf8");
  assert.doesNotMatch(source, /localStorage|indexedDB|chrome\.storage\.local\.set|sessionStorage/, "no extension-local resume storage");
});

test("AUTH: without a token nothing is requested and the user is told to sign in; another user's resumes are never shown", async (t) => {
  const c = await boot({ token: false }); t.after(c.app.close);
  await c.manager.load();
  assert.match(c.err(), /Not logged in/);
  assert.equal(c.requests.length, 0);
  // a second account sees only its own data
  const other = c.app.tokenFor(2);
  c.app.repo._seedProfile(2, { resume_text: fx.MINIMAL_REACT_RESUME + "\nEDUCATION\nB.Tech in Computer Science, Example University\n2022 - 2026\n" });
  const api2 = createResumeApi({ chromeApi: { storage: { local: { get: async () => ({ token: other, apiBaseUrl: `${c.app.origin}/api` }) } } }, defaultApiBaseUrl: "x" });
  const l2 = await api2.listResumes();
  assert.equal(l2.resumes.length, 1);
  const user1Resume = (await c.app.call("GET", "/resumes", { token: c.tok })).data.resumes[0].id; // created for user 1 via the real API
  assert.notEqual(user1Resume, l2.resumes[0].id);
  await assert.rejects(api2.getResume(user1Resume), (e) => e.status === 404);
  await assert.rejects(api2.activate(user1Resume), (e) => e.status === 404);
  await assert.rejects(api2.remove(user1Resume), (e) => e.status === 404);
  await assert.rejects(api2.downloadOriginal(user1Resume), (e) => e.status === 404);
});

test("SECURITY: hostile file names from the backend are shown as text; no AI credentials or provider hosts anywhere in the resume code", async (t) => {
  const c = await boot(); t.after(c.app.close);
  const evil = { activeResumeId: 1, resumes: [{ id: 1, name: '<img src=x onerror="window.pwned=1">', fileType: "pdf", createdAt: "2026-01-01", isActive: true, sourceType: "upload", hasFile: true, versionCount: 0, versions: [], factsCount: 3 }] };
  c.manager.state.data = evil; c.manager.render();
  assert.equal(c.doc.querySelectorAll("#resumesList img").length, 0);
  assert.equal(c.dom.window.pwned, undefined);
  for (const f of ["resume-manager.js", "resume-api.js", "dashboard.js"]) {
    const src = readFileSync(path.join(dir, "..", f), "utf8");
    assert.doesNotMatch(src, /generativelanguage|groq|openrouter|anthropic|openai|AI_API_KEY|x-goog-api-key/i, f);
  }
});
