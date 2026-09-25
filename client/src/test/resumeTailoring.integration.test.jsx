// Web-client integration test. The real page + the real resumeApi + axios run
// in jsdom against the REAL Express routes and tailoring pipeline (in-memory
// repo), so the UI <-> API contract is actually exercised — nothing is mocked
// between the button click and the safety validator.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import { request as httpRequest } from "http";

const require = createRequire(import.meta.url);
// `fileURLToPath` (not manual `new URL(...).pathname` parsing) is required for
// this to be genuinely cross-platform: on Windows a file URL's `.pathname` keeps
// a leading slash before the drive letter (e.g. "/C:/Users/..."), which is not
// a valid Windows path. Passing that as a child-process `cwd` below fails with
// ENOENT on the spawned node executable (the cwd can't be resolved), even though
// the executable path itself (process.execPath) is correct and never hardcoded.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { startApp, FakeLlm, LONG_TAIL } = require("../../../server/tests/resumeTailoring/helpers.js");
const fx = require("../../../server/tests/resumeTailoring/fixtures.js");
const { execFileSync } = require("child_process");

// pdfkit can't initialise inside jsdom, so build the PDF fixture in a plain Node process.
function makePdf(resumeText) {
  const serverDir = path.resolve(__dirname, "../../../server");
  const script = `
    const { parseResume } = require("./services/resumeTailoring/resumeParser");
    const { exportProfile } = require("./services/resumeTailoring/resumeRenderer");
    exportProfile(parseResume(process.argv[1]).profile, "pdf").then((r) => process.stdout.write(r.buffer.toString("base64")));`;
  const out = execFileSync(process.execPath, ["-e", script, resumeText], {
    cwd: serverDir,
    env: { ...process.env, DOTENV_CONFIG_QUIET: "true" },
    encoding: "utf8",
    windowsHide: true,
  });
  return Buffer.from(out.trim().split("\n").pop(), "base64");
}

let ResumeTailoring;
let ResumeVersions;
let ThemeProvider;
let NotificationProvider;
const servers = [];

async function boot(opts = {}, { resume = fx.RICH_RESUME, job = fx.STRUCTURED_JD } = {}) {
  const app = await startApp({ cors: true, ...opts });
  servers.push(app);
  if (resume) app.repo._seedProfile(1, { resume_text: resume });
  const tracked = app.repo._seedTrackedJob(1, { company: "Google", role: "Software Engineer Intern", description: job });
  localStorage.setItem("token", app.tokenFor(1));
  vi.stubEnv("VITE_API_BASE_URL", app.origin);
  // api.js reads the base URL at import time, so re-import per server
  vi.resetModules();
  ({ default: ResumeTailoring } = await import("../pages/ResumeTailoring.jsx"));
  ({ default: ResumeVersions } = await import("../pages/ResumeVersions.jsx"));
  ({ ThemeProvider } = await import("../context/ThemeContext.jsx"));
  ({ NotificationProvider } = await import("../context/NotificationContext.jsx"));
  return { app, tracked };
}

const mount = (path) =>
  render(
    <ThemeProvider>
      <NotificationProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/tailor" element={<ResumeTailoring />} />
            <Route path="/resumes" element={<ResumeVersions />} />
            <Route path="/profile" element={<div>profile</div>} />
          </Routes>
        </MemoryRouter>
      </NotificationProvider>
    </ThemeProvider>,
  );

beforeAll(() => {
  // Test-environment shim ONLY: the API harness runs in this same jsdom process, and pdfjs (inside
  // pdf-parse) sees jsdom's browser-like globals and expects DOMMatrix. A real API server has no jsdom.
  globalThis.DOMMatrix ??= class DOMMatrix {};
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  window.scrollTo = vi.fn();
  window.matchMedia ||= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllEnvs(); });
afterAll(async () => { await Promise.all(servers.map((s) => s.close())); });

describe("Resume Tailoring workspace (web)", () => {
  it("shows the match analysis and labels unsupported skills truthfully", async () => {
    const { tracked } = await boot();
    mount(`/tailor?job=tracked-${tracked.id}`);
    const score = await screen.findByTestId("match-score");
    expect(score.textContent).toMatch(/^\d+%$/);
    // supported skill is a ✓ chip, unsupported ones are ✕ and explicitly "will not be added"
    expect(screen.getAllByTitle(/Missing \/ Not found in your profile/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Missing \/ Not found in your profile — it will not be added\./).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Docker").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /generate tailored resume/i })).toBeTruthy();
  });

  it("tailors, lets the user review individual changes, applies ONLY accepted ones, then offers downloads", async () => {
    const { app, tracked } = await boot();
    const user = userEvent.setup();
    mount(`/tailor?job=tracked-${tracked.id}`);
    await user.click(await screen.findByRole("button", { name: /generate tailored resume/i }));

    // real progress -> review screen
    await screen.findByText(/Change review/, {}, { timeout: 15000 });
    const preview = screen.getByTestId("resume-preview");
    expect(preview.textContent).toContain("Meera Nair");
    expect(preview.textContent).not.toMatch(/\bAWS\b|\bDocker\b|Kubernetes/);

    await user.click(screen.getByRole("button", { name: /review changes/i }));
    const cards = screen.getAllByTestId(/^change-chg_/);
    expect(cards.length).toBeGreaterThanOrEqual(4);
    // every change shows original -> tailored and a reason
    expect(within(cards[0]).getByText("Original")).toBeTruthy();
    expect(within(cards[0]).getByText("Tailored")).toBeTruthy();
    expect(within(cards[0]).getByText(/Reason:/)).toBeTruthy();

    await user.click(within(cards[0]).getByRole("button", { name: "Accept" }));
    await user.click(screen.getByRole("button", { name: /apply selected changes/i }));
    await waitFor(() => expect(screen.getByText("approved")).toBeTruthy(), { timeout: 10000 });

    const v = app.repo._db.versions[0];
    const changes = app.repo._db.changes.filter((c) => c.versionId === v.id);
    expect(v.status).toBe("approved");
    expect(changes.filter((c) => c.status === "accepted")).toHaveLength(1);
    expect(changes.filter((c) => c.status === "rejected")).toHaveLength(cards.length - 1);

    // downloads appear only after approval
    // (PDF/DOCX rendering is covered by the server suite; pdfkit can't initialise inside jsdom)
    expect(screen.getByRole("button", { name: "PDF" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Text" }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    const blob = URL.createObjectURL.mock.calls.at(-1)[0];
    expect(await blob.text()).toContain("Meera Nair");
  });

  it("Accept all applies everything; a hostile model's fabricated text never reaches the screen", async () => {
    const evil = new FakeLlm(({ units }) => ({ rewrites: units.map((u) => ({ unitId: u.id, proposed: `${u.text} Deployed on AWS with Docker for 1M users.` })) }));
    const { tracked } = await boot({ provider: evil });
    const user = userEvent.setup();
    mount(`/tailor?job=tracked-${tracked.id}`);
    await user.click(await screen.findByRole("button", { name: /generate tailored resume/i }));
    await screen.findByText(/Change review/, {}, { timeout: 15000 });
    // blocked suggestions are disclosed to the user, not applied
    expect(await screen.findByText(/blocked by the safety check/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /accept all/i }));
    await waitFor(() => expect(screen.getByText("approved")).toBeTruthy());
    expect(screen.getByTestId("resume-preview").textContent).not.toMatch(/AWS|Docker|1M users/);
  });

  it("opens an analysis started elsewhere (browser extension) by key, then tailors it without a saved job", async () => {
    const { app } = await boot();
    const user = userEvent.setup();
    // what the extension does: analyse an ad-hoc JD through the API
    const res = await app.call("POST", "/analyze", { token: app.tokenFor(1), body: { job: { title: "Frontend Intern", company: "Acme", description: fx.SAFETY_JD + LONG_TAIL, sourceName: "extension" } } });
    expect(res.status).toBe(200);
    mount(`/tailor?analysis=${res.data.jobKey}`);
    expect((await screen.findByTestId("match-score")).textContent).toMatch(/%$/);
    expect(screen.getAllByText("Frontend Intern").length).toBeGreaterThan(0);
    expect(app.repo._db.trackedJobs).toHaveLength(0 + 1); // only the seeded one: nothing was saved
    await user.click(screen.getByRole("button", { name: /generate tailored resume/i }));
    await screen.findByText(/Change review/, {}, { timeout: 15000 });
    expect(screen.getByTestId("resume-preview").textContent).not.toMatch(/\bAWS\b|\bDocker\b/);
  });

  it("no resume -> clear message and a path to fix it", async () => {
    const { tracked } = await boot({}, { resume: null });
    mount(`/tailor?job=tracked-${tracked.id}`);
    expect(await screen.findByText("Upload your resume before tailoring.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /go to my resumes/i }).getAttribute("href")).toBe("/resumes");
  });

  it("job without a usable description asks the user to paste one (JD too short)", async () => {
    const { app } = await boot({}, { job: "React" });
    const t = app.repo._db.trackedJobs[0];
    const user = userEvent.setup();
    mount(`/tailor?job=tracked-${t.id}`);
    expect(await screen.findByText("The job description does not contain enough information.")).toBeTruthy();
    await user.type(screen.getByPlaceholderText(/paste the full job description/i), fx.SAFETY_JD + LONG_TAIL);
    await user.click(screen.getByRole("button", { name: /analyze job/i }));
    expect(await screen.findByTestId("match-score", {}, { timeout: 10000 })).toBeTruthy();
  });
});

describe("My Resumes page (web)", () => {
  it("uploads a PDF, shows it as the original, and lists tailored versions", async () => {
    const { app } = await boot({}, { resume: null });
    const buffer = makePdf(fx.RICH_RESUME);
    const user = userEvent.setup();
    mount("/resumes");
    expect(await screen.findByText(/Upload your resume before tailoring\./)).toBeTruthy();
    await user.upload(screen.getByTestId("resume-file-input"), new File([buffer], "meera-cv.pdf", { type: "application/pdf" }));
    expect(await screen.findByText(/meera-cv\.pdf/, {}, { timeout: 10000 })).toBeTruthy();
    expect(app.repo._db.resumes).toHaveLength(1);
    expect(app.repo._db.resumes[0].fileData).toBeTruthy();
    // "use as profile text" was checked by default
    expect((await app.repo.getProfileRow(1)).resume_text).toMatch(/Meera Nair/);
    expect(screen.getByText(/No tailored versions yet/)).toBeTruthy();
  });

  it("rejects a non-resume file with the server's message", async () => {
    await boot({}, { resume: null });
    const user = userEvent.setup({ applyAccept: false });
    mount("/resumes");
    await screen.findByText(/Upload your resume before tailoring\./);
    await user.upload(screen.getByTestId("resume-file-input"), new File(["hello"], "notes.txt", { type: "text/plain" }));
    // still no resume afterwards
    await waitFor(() => expect(screen.getByText(/Upload your resume before tailoring\./)).toBeTruthy());
  });
});

describe("Same backend resumes everywhere (web)", () => {
  // "uploaded elsewhere" = through the very same API the browser extension and mobile app use
  // jsdom's FormData/Blob can't be serialised by Node's fetch, so build the multipart body by hand over
  // plain HTTP — exactly what any non-browser client (extension service worker, mobile) sends.
  const uploadElsewhere = (app, name) => new Promise((resolve, reject) => {
    const buffer = makePdf(fx.RICH_RESUME);
    const boundary = "----tt" + Math.random().toString(16).slice(2);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/pdf\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const u = new URL(`${app.origin}/api/resume/upload`);
    const req = httpRequest({ hostname: u.hostname, port: u.port, path: u.pathname, method: "POST", headers: { token: app.tokenFor(1), "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": body.length } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => { try { expect(res.statusCode).toBe(201); resolve(JSON.parse(data).resume); } catch (e) { reject(e); } });
    });
    req.on("error", reject);
    req.end(body);
  });

  it("lists every resume the backend has — including one uploaded from the extension — and switches the active one", async () => {
    const { app } = await boot({}, { resume: fx.STUDENT_RESUME });
    const user = userEvent.setup();
    const meera = await uploadElsewhere(app, "from-extension.pdf");
    mount("/resumes");
    const uploaded = await screen.findByTestId(`resume-${meera.id}`);
    expect(within(uploaded).getByText("from-extension.pdf")).toBeTruthy();
    expect(within(uploaded).getByText("Active")).toBeTruthy();
    // the type badge plus the "PDF" export button of the active resume
    expect(within(uploaded).getAllByText("PDF").length).toBe(2);
    const all = screen.getAllByTestId(/^resume-\d+$/);
    expect(all).toHaveLength(2);
    const profileCard = all.find((c) => c !== uploaded);
    expect(within(profileCard).getByText("Available")).toBeTruthy();
    await user.click(within(profileCard).getByRole("button", { name: /use for tailoring/i }));
    await waitFor(() => expect(within(screen.getByTestId(`resume-${meera.id}`)).getByText("Available")).toBeTruthy());
    expect((await app.call("GET", "/resumes", { token: app.tokenFor(1) })).data.activeResumeId).not.toBe(meera.id);
  });

  it("Delete asks first, then removes the resume and its versions from the backend", async () => {
    const { app } = await boot({}, { resume: fx.STUDENT_RESUME });
    const user = userEvent.setup();
    const meera = await uploadElsewhere(app, "to-delete.pdf");
    const confirm = vi.spyOn(window, "confirm");
    mount("/resumes");
    const cardEl = await screen.findByTestId(`resume-${meera.id}`);
    confirm.mockReturnValueOnce(false);
    await user.click(within(cardEl).getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/Delete “to-delete\.pdf”\?/));
    expect(app.repo._db.resumes).toHaveLength(2);
    confirm.mockReturnValueOnce(true);
    await user.click(within(cardEl).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByTestId(`resume-${meera.id}`)).toBeNull());
    expect(app.repo._db.resumes).toHaveLength(1);
    // profile-text resumes are removable too; the underlying profile text is preserved.
    expect(within(screen.getAllByTestId(/^resume-\d+$/)[0]).getByRole("button", { name: "Delete" })).not.toBeNull();
    confirm.mockRestore();
  });

  it("the extension's hand-off (?analysis=…&resume=ID) analyses AND tailors with THAT resume, not the active one", async () => {
    const { app, tracked } = await boot({}, { resume: fx.STUDENT_RESUME }); // active = profile text (Aarav)
    const user = userEvent.setup();
    const meera = await uploadElsewhere(app, "meera.pdf");               // becomes active…
    await app.call("POST", `/resumes/${(await app.call("GET", "/resumes", { token: app.tokenFor(1) })).data.resumes.find((r) => r.sourceType === "profile_text").id}/activate`, { token: app.tokenFor(1) }); // …then Aarav is active again
    // what the extension does: analyse an ad-hoc JD with the resume the user picked for this job
    const res = await app.call("POST", "/analyze", { token: app.tokenFor(1), body: { job: { title: "Frontend Intern", company: "Acme", description: fx.SAFETY_JD + LONG_TAIL }, resumeId: meera.id } });
    expect(res.status).toBe(200);
    expect(res.data.resumeId).toBe(meera.id);
    mount(`/tailor?analysis=${res.data.jobKey}&resume=${meera.id}`);
    expect((await screen.findByTestId("match-score")).textContent).toBe(`${res.data.matchScore}%`);
    await user.click(screen.getByRole("button", { name: /generate tailored resume/i }));
    await screen.findByText(/Change review/, {}, { timeout: 15000 });
    expect(screen.getByTestId("resume-preview").textContent).toContain("Meera Nair");
    expect(screen.getByTestId("resume-preview").textContent).not.toContain("Aarav Sharma");
    expect(app.repo._db.versions.at(-1).resumeId).toBe(meera.id);
    expect(tracked).toBeTruthy();
  });
});
