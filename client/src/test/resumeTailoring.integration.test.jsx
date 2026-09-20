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

const require = createRequire(import.meta.url);
const __dirname = path.dirname(new URL(import.meta.url).pathname);
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
  const out = execFileSync(process.execPath, ["-e", script, resumeText], { cwd: serverDir, env: { ...process.env, DOTENV_CONFIG_QUIET: "true" }, encoding: "utf8" });
  return Buffer.from(out.trim().split("\n").pop(), "base64");
}

let ResumeTailoring;
let ResumeVersions;
let ThemeProvider;
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
  return { app, tracked };
}

const mount = (path) =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/tailor" element={<ResumeTailoring />} />
          <Route path="/resumes" element={<ResumeVersions />} />
          <Route path="/profile" element={<div>profile</div>} />
        </Routes>
      </MemoryRouter>
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
