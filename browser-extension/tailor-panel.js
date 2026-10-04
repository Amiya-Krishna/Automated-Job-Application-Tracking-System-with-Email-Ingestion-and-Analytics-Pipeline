// TrackTrail side panel for job pages (classic content script, loaded after
// jd-extract.js and before content.js).
//
// The panel ONLY: extracts (via TrackTrailExtract) -> normalises -> asks the
// background worker to call the authenticated API -> displays the result. All
// matching / tailoring / validation happens on the backend. No AI keys, no
// business logic here.
//
// Rendering rule: every piece of text (page-derived OR API-derived) goes in
// through textContent, never innerHTML, so hostile page/JD text can't inject
// markup. The panel lives in a Shadow DOM so host-page CSS can't restyle it.
(function (root) {
  "use strict";

  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .panel { position: fixed; right: 16px; bottom: 16px; width: min(340px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; z-index: 2147483000;
    background: #fff; color: #0f172a; border: 1px solid #e2e8f0; border-radius: 20px; box-shadow: 0 20px 48px rgba(2,6,23,.28);
    font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 16px; }
  .panel:focus { outline: none; }
  .panel.dark { background: #0f172a; color: #e2e8f0; border-color: #334155; }
  .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .brand { font-weight: 800; letter-spacing: .02em; }
  .x { border: 0; background: transparent; font-size: 20px; cursor: pointer; color: inherit; min-width: 32px; min-height: 32px; border-radius: 8px; }
  .x:hover { background: rgba(100,116,139,.18); }
  .title { font-weight: 700; font-size: 14px; margin: 2px 0 0; }
  .sub { color: #475569; margin: 0 0 6px; }
  .dark .sub { color: #94a3b8; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0; }
  button.btn { border: 0; border-radius: 12px; padding: 8px 12px; min-height: 36px; font-weight: 700; font-size: 12px; cursor: pointer; background: #020617; color: #fff; }
  .dark button.btn { background: #0e7490; }
  button.btn.secondary { background: #e2e8f0; color: #0f172a; }
  .dark button.btn.secondary { background: #1e293b; color: #e2e8f0; }
  button.btn:disabled { opacity: .6; cursor: default; }
  button:focus-visible, input:focus-visible, textarea:focus-visible, a.link:focus-visible, summary:focus-visible { outline: 3px solid #0891b2; outline-offset: 2px; }
  .dark button:focus-visible, .dark input:focus-visible, .dark textarea:focus-visible, .dark a.link:focus-visible, .dark summary:focus-visible { outline-color: #67e8f9; }
  .score { font-size: 34px; font-weight: 900; margin: 6px 0 0; line-height: 1.1; }
  .verdict { font-weight: 700; margin: 0 0 4px; }
  .meter { height: 8px; border-radius: 999px; background: #e2e8f0; overflow: hidden; margin: 6px 0; }
  .dark .meter { background: #1e293b; }
  .meter > span { display: block; height: 100%; background: #0e7490; }
  .label { text-transform: uppercase; font-size: 10px; font-weight: 800; color: #64748b; letter-spacing: .08em; }
  .dark .label { color: #94a3b8; }
  .group { margin: 8px 0 0; }
  .group h3 { font-size: 12px; margin: 0; font-weight: 800; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0; padding: 0; list-style: none; }
  .chip { border-radius: 999px; padding: 3px 9px; font-size: 11px; font-weight: 700; }
  .chip.MATCHED { background: #d1fae5; color: #065f46; }
  .chip.PARTIAL_MATCH { background: #fef3c7; color: #92400e; }
  .chip.NOT_FOUND { background: #ffe4e6; color: #9f1239; }
  .note { color: #475569; font-size: 12px; margin: 6px 0; }
  .dark .note { color: #94a3b8; }
  details.how { margin: 6px 0; font-size: 12px; } details.how summary { cursor: pointer; font-weight: 700; min-height: 24px; }
  .err { background: #fff1f2; color: #9f1239; border-radius: 12px; padding: 10px; margin: 10px 0; }
  .dark .err { background: #4c0519; color: #fecdd3; }
  .warn { background: #fffbeb; color: #92400e; border-radius: 12px; padding: 10px; margin: 8px 0; font-size: 12px; }
  .dark .warn { background: #451a03; color: #fde68a; }
  .ok { background: #ecfdf5; color: #065f46; border-radius: 12px; padding: 10px; margin: 10px 0; }
  .dark .ok { background: #064e3b; color: #a7f3d0; }
  .err .row, .ok .row { margin: 8px 0 0; }
  ol.steps { list-style: none; padding: 0; margin: 8px 0; }
  ol.steps li { padding: 2px 0; color: #64748b; }
  ol.steps li.done { color: #047857; } ol.steps li.active { color: inherit; font-weight: 700; }
  .dark ol.steps li.done { color: #6ee7b7; }
  progress { width: 100%; height: 8px; accent-color: #0e7490; }
  .pick { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; }
  .pick button { text-align: left; border: 1px solid #94a3b8; background: transparent; color: inherit; border-radius: 12px; padding: 8px 10px; min-height: 40px; cursor: pointer; font: inherit; }
  .pick button[aria-checked="true"] { border-color: #0e7490; box-shadow: 0 0 0 2px #0e7490 inset; }
  .pick .pickName { font-weight: 700; word-break: break-word; }
  .pick .pickMeta { color: #475569; font-size: 11px; }
  .dark .pick .pickMeta { color: #94a3b8; }
  .manual { margin: 10px 0; }
  .manual label { display: block; }
  .manual input, .manual textarea { width: 100%; margin-top: 6px; border: 1px solid #94a3b8; border-radius: 12px; padding: 8px 10px; min-height: 36px; font: inherit; color: inherit; background: transparent; }
  .manual textarea { resize: vertical; }
  a.link { color: #0e7490; font-weight: 700; cursor: pointer; text-decoration: underline; display: inline-block; min-height: 24px; }
  .dark a.link { color: #67e8f9; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  @media (prefers-reduced-motion: no-preference) { button.btn { transition: background .15s, opacity .15s; } }
  `;

  const STAGE_LABELS = [
    ["analyzing_resume", "Analyzing Resume…"],
    ["analyzing_jd", "Analyzing Job Description…"],
    ["matching", "Matching Requirements…"],
    ["generating", "Generating Tailored Resume…"],
    ["validating", "Validating Changes…"],
    ["ready", "Resume Ready"],
  ];
  const ICON = { MATCHED: "✓", PARTIAL_MATCH: "⚠", NOT_FOUND: "✕" };
  const GROUPS = [
    ["MATCHED", "Matched on your resume"],
    ["PARTIAL_MATCH", "Related experience (partial credit)"],
    ["NOT_FOUND", "Not found on your resume"],
  ];
  const GROUP_LIMIT = 6;
  const SOURCE_LABEL = { linkedin: "LinkedIn", indeed: "Indeed", naukri: "Naukri", internshala: "Internshala", wellfound: "Wellfound", unstop: "Unstop" };
  const DEFAULT_ERROR = "Something went wrong.";

  function createPanel({ doc, chromeApi, extract, hostname, sleep, onClose }) {
    doc = doc || root.document;
    chromeApi = chromeApi || root.chrome;
    extract = extract || root.TrackTrailExtract;
    hostname = hostname || root.location.hostname;
    sleep = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));

    const host = doc.createElement("div");
    host.id = "tracktrail-panel-host";
    const shadow = host.attachShadow({ mode: "open" });
    const style = doc.createElement("style");
    style.textContent = CSS;
    const panel = doc.createElement("div");
    panel.className = "panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "TrackTrail resume match");
    panel.tabIndex = -1;
    // `content` is rebuilt on every render; the two live regions persist so
    // screen readers reliably announce progress and failures.
    const content = doc.createElement("div");
    const live = doc.createElement("div");
    live.className = "sr";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    const alertLive = doc.createElement("div");
    alertLive.className = "sr";
    alertLive.setAttribute("role", "alert");
    panel.append(content, live, alertLive);
    shadow.append(style, panel);

    let st = {
      busy: null,
      detected: null,
      analysis: null,
      stage: null,
      version: null,
      saved: null,
      error: null,
      webUrl: null,
      cancelled: false,
      runId: 0,
      lastAction: null,
      showAll: false,
      manualOpen: null,
      resumes: null,
      activeResumeId: null,
      resumeId: null,
      resumeConfirmed: false,
      selecting: false,
      pickId: null,
      manual: { title: "", company: "", description: "" },
    };

    const el = (tag, cls, txt) => {
      const n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (txt !== undefined) n.textContent = txt;
      return n;
    };
    const button = (label, onClick, { secondary = false, disabled = false, key } = {}) => {
      const b = el("button", `btn${secondary ? " secondary" : ""}`, label);
      b.type = "button";
      b.disabled = disabled;
      if (key) b.dataset.key = key;
      b.addEventListener("click", onClick);
      return b;
    };
    // keyboard-operable text action (kept as <a class="link"> — same look, now focusable)
    const linkAction = (label, onClick, key) => {
      const a = el("a", "link", label);
      a.setAttribute("role", "link");
      a.tabIndex = 0;
      if (key) a.dataset.key = key;
      a.addEventListener("click", onClick);
      a.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      });
      return a;
    };

    const announce = (text) => { live.textContent = text || ""; };
    const announceError = (text) => { alertLive.textContent = ""; alertLive.textContent = text || ""; };
    const describeError = (r) =>
      root.TrackTrailErrors
        ? root.TrackTrailErrors.describe(r, DEFAULT_ERROR)
        : { kind: "error", message: r.error || DEFAULT_ERROR, retryable: true };

    const send = (message) =>
      new Promise((resolve) => {
        try {
          if (!chromeApi.runtime?.id)
            return resolve({ ok: false, error: "The extension was updated. Reload this page.", code: "context_invalidated" });
          chromeApi.runtime.sendMessage(message, (r) => {
            void chromeApi.runtime.lastError; // mark as handled
            resolve(r || { ok: false, error: "No response from the extension." });
          });
        } catch (e) {
          resolve({ ok: false, error: "The extension was updated. Reload this page.", code: "context_invalidated" });
        }
      });

    const fail = (r) => {
      const info = describeError(r);
      st.error = { message: info.message, code: r.code || null, kind: info.kind, retryable: info.retryable };
      st.busy = null;
      announceError(info.message);
      render();
    };
    const webUrl = async () => {
      if (!st.webUrl) st.webUrl = (await send({ type: "GET_WEB_URL" })).url || null;
      return st.webUrl;
    };
    const openWeb = async (path) => {
      const base = await webUrl();
      if (base) root.open(`${base}${path}`, "_blank", "noopener");
    };

    // ---------------------------------------------------------- actions
    // Re-read the page whenever an action starts: SPA pages (LinkedIn/Indeed)
    // finish rendering the description after the panel may already be open.
    const detect = () => {
      st.detected = extract.detectJob(doc, root.location);
      return st.detected;
    };
    const currentJob = () => {
      const detected = detect();
      const manualDescription = st.manual.description.trim();
      if (!manualDescription) return extract.toApiJob(detected);
      return {
        title: st.manual.title.trim() || detected.role || "",
        company: st.manual.company.trim() || detected.company || "",
        description: manualDescription,
        sourceName: "manual",
      };
    };

    // ------------------------------------------------- resume selection
    // The BACKEND owns resumes. The panel only lists them (RESUME_LIST) and passes the chosen id along.
    async function ensureResumes() {
      if (st.resumes) return st.resumes;
      const r = await send({ type: "RESUME_LIST" });
      if (!r.ok) {
        fail(r);
        return null;
      }
      if (!r.resumes || !Array.isArray(r.resumes.resumes)) {
        fail({ error: "Unexpected response from TrackTrail. Please try again." });
        return null;
      }
      st.resumes = r.resumes.resumes;
      st.activeResumeId = r.resumes.activeResumeId;
      return st.resumes;
    }
    const resumeById = (id) => (st.resumes || []).find((r) => r.id === id) || null;
    const selectedResume = () =>
      resumeById(st.resumeId) || (st.resumes && st.resumes.length === 1 ? st.resumes[0] : null);

    async function changeResume() {
      st.lastAction = changeResume;
      st.busy = "resumes";
      st.error = null;
      render();
      const list = await ensureResumes();
      st.busy = null;
      if (!list) return;
      st.selecting = true;
      st.pickId = st.resumeId || st.activeResumeId;
      render();
    }

    async function continueWithSelection() {
      if (!st.pickId) return;
      st.resumeId = st.pickId;
      st.resumeConfirmed = true;
      st.selecting = false;
      await analyze(); // Select Resume -> Continue to Analysis ...
      if (st.analysis && !st.error) await runTailoring(); // ... -> Tailor Resume
    }

    async function saveJob() {
      st.lastAction = saveJob;
      const d = detect();
      // Never save guessed values: use what the page really showed, or what the user typed.
      const role = st.manual.title.trim() || d.role;
      const company = st.manual.company.trim() || d.company;
      if (!role || !company) {
        st.manualOpen = true;
        return fail({ error: "Add the job title and company below before saving.", code: "validation" });
      }
      st.busy = "save";
      st.error = null;
      render();
      const r = await send({ type: "SAVE_JOB", job: extract.toSaveJob({ ...d, role, company }, hostname) });
      if (!r.ok) return fail(r);
      st.saved = { duplicate: Boolean(r.duplicate), status: (r.job && r.job.status) || "Applied" };
      st.busy = null;
      announce(r.duplicate ? "This job was already saved." : "Job saved.");
      render();
    }

    async function analyze() {
      st.lastAction = analyze;
      const d = currentJob();
      st.busy = "analyze";
      st.error = null;
      st.analysis = null;
      st.version = null;
      st.showAll = false;
      announce("Analyzing the job description…");
      render();
      const r = await send({
        type: "RESUME_ANALYZE",
        job: d,
        ...(st.resumeId ? { resumeId: st.resumeId } : {}),
      });
      if (!r.ok) return fail(r);
      st.analysis = r.analysis;
      st.busy = null;
      announce(
        r.analysis && r.analysis.matchScore != null
          ? `Analysis complete. ${r.analysis.matchScore}% match.`
          : "Analysis complete.",
      );
      render();
    }

    // "Tailor Resume": 0 resumes -> ask the user to add one; 1 -> use it; several -> Select Resume first.
    async function tailor() {
      st.lastAction = tailor;
      st.error = null;
      st.busy = "resumes";
      render();
      const list = await ensureResumes();
      st.busy = null;
      if (!list) return;
      if (!list.length)
        return fail({ error: "Upload your resume before tailoring.", code: "no_resume" });
      if (list.length === 1) {
        st.resumeId = list[0].id;
        st.resumeConfirmed = true;
      }
      if (list.length > 1 && !st.resumeConfirmed) {
        st.selecting = true;
        st.pickId = st.resumeId || st.activeResumeId;
        render();
        return;
      }
      await runTailoring();
    }

    function cancelRun() {
      st.runId += 1; // any in-flight polling loop stops at its next check
      st.busy = null;
      st.stage = null;
      announce("Tailoring cancelled. Nothing was changed.");
      render();
    }

    async function runTailoring() {
      st.lastAction = runTailoring;
      const d = currentJob();
      const run = ++st.runId;
      const stale = () => st.cancelled || run !== st.runId;
      st.busy = "tailor";
      st.error = null;
      st.version = null;
      st.stage = "analyzing_resume";
      st.cancelled = false;
      announce(`Step 1 of 5: ${STAGE_LABELS[0][1]}`);
      render();
      const started = await send({
        type: "RESUME_TAILOR",
        job: d,
        ...(st.resumeId ? { resumeId: st.resumeId } : {}),
      });
      if (stale()) return;
      if (!started.ok) return fail(started);
      if (!started.session || !started.session.id)
        return fail({ error: "Unexpected response from TrackTrail. Please try again." });
      let session = started.session;
      const t0 = Date.now();
      while (session.status !== "succeeded" && session.status !== "failed") {
        if (stale()) return;
        if (Date.now() - t0 > 180000)
          return fail({ error: "This is taking longer than expected. Please try again.", code: "timeout" });
        await sleep(1000);
        if (stale()) return;
        const p = await send({ type: "RESUME_SESSION", id: session.id });
        if (stale()) return;
        if (!p.ok) return fail(p);
        session = p.session;
        if (session.stage !== st.stage) {
          const n = STAGE_LABELS.findIndex(([k]) => k === session.stage);
          if (n >= 0 && n < 5) announce(`Step ${n + 1} of 5: ${STAGE_LABELS[n][1]}`);
        }
        st.stage = session.stage;
        render();
      }
      if (session.status === "failed") return fail({ error: session.error, code: session.errorCode });
      const v = await send({ type: "RESUME_VERSION", id: session.versionId });
      if (stale()) return;
      if (!v.ok) return fail(v);
      st.version = v.version;
      st.analysis = v.version.analysis;
      st.busy = null;
      st.stage = "ready";
      announce("Tailored resume draft is ready for your review.");
      render();
    }

    // ----------------------------------------------------------- render
    // Rebuilding the DOM would drop keyboard focus (and the caret in the
    // paste box during polling), so focus is restored by a stable data-key.
    function render() {
      const active = shadow.activeElement;
      const key = active && active.dataset ? active.dataset.key : null;
      const caret = active && typeof active.selectionStart === "number" ? [active.selectionStart, active.selectionEnd] : null;
      const hadFocus = Boolean(active);
      content.replaceChildren();
      draw();
      if (!hadFocus) return;
      const target = key ? content.querySelector(`[data-key="${key}"]`) : null;
      if (target && !target.disabled) {
        target.focus({ preventScroll: true });
        if (caret && typeof target.setSelectionRange === "function") target.setSelectionRange(caret[0], caret[1]);
      } else {
        panel.focus({ preventScroll: true }); // the focused control went away/disabled: keep focus inside the dialog
      }
    }

    function requirementGroups(a) {
      const reqs = Array.isArray(a.requirements) ? a.requirements : [];
      return GROUPS.map(([state, title]) => [state, title, reqs.filter((r) => r.state === state)]);
    }

    function drawAnalysis(a) {
      const groups = requirementGroups(a);
      const total = groups.reduce((n, g) => n + g[2].length, 0);
      const score = a.matchScore;
      content.append(el("div", "label", "Resume match"));
      content.append(el("div", "score", score === null || score === undefined ? "—" : `${score}%`));
      if (score === null || score === undefined) {
        content.append(el("p", "verdict", "Not enough recognised requirements to score this job."));
      } else {
        content.append(el("p", "verdict", score >= 70 ? "Strong match" : score >= 40 ? "Partial match" : "Weak match"));
        const meter = el("div", "meter");
        meter.setAttribute("role", "meter");
        meter.setAttribute("aria-label", "Resume match score");
        meter.setAttribute("aria-valuemin", "0");
        meter.setAttribute("aria-valuemax", "100");
        meter.setAttribute("aria-valuenow", String(score));
        const bar = el("span");
        bar.style.width = `${Math.max(0, Math.min(100, score))}%`;
        meter.append(bar);
        content.append(meter);
      }
      if (total) {
        const [m, p, n] = groups.map((g) => g[2].length);
        content.append(el("p", "note", `${m} matched · ${p} related · ${n} missing, out of ${total} requirements found in the job description.`));
      }
      const how = el("details", "how");
      how.append(el("summary", "", "How is this calculated?"));
      how.append(el("p", "note", "Each requirement in the job description is checked against your resume. A full match counts as 1, related experience counts as half, and a missing skill counts as 0. Required skills weigh more than optional ones."));
      content.append(how);

      groups.forEach(([state, title, items]) => {
        if (!items.length) return;
        const g = el("div", "group");
        g.append(el("h3", "", `${title} (${items.length})`));
        const list = el("ul", "chips");
        (st.showAll ? items : items.slice(0, GROUP_LIMIT)).forEach((r) => {
          const c = el("li", `chip ${state}`, `${ICON[r.state]} ${r.requirement}`);
          c.title = r.label;
          list.append(c);
        });
        g.append(list);
        content.append(g);
      });
      if (groups.some((g) => g[2].length > GROUP_LIMIT)) {
        content.append(
          button(st.showAll ? "Show fewer" : "Show all requirements", () => { st.showAll = !st.showAll; render(); }, { secondary: true, key: "show-all" }),
        );
      }
      content.append(el("p", "note", "Skills marked ✕ aren't on your resume, so they are never added to it."));
      const links = el("div", "row");
      links.append(
        button(
          "View Full Analysis",
          () =>
            openWeb(
              st.version
                ? `/tailor?version=${st.version.id}`
                : `/tailor?analysis=${encodeURIComponent(a.jobKey)}${a.resumeId ? `&resume=${a.resumeId}` : ""}`,
            ),
          { secondary: true, key: "view-analysis" },
        ),
      );
      content.append(links);
    }

    function draw() {
      const head = el("div", "head");
      head.append(el("span", "brand", "TrackTrail"));
      const x = button("×", () => api.close(), { secondary: true, key: "close" });
      x.className = "x";
      x.setAttribute("aria-label", "Close TrackTrail panel");
      head.append(x);
      content.append(head);

      const d = st.detected || detect();
      content.append(el("p", "title", d.role || "Role not detected"));
      content.append(el("p", "sub", d.company || "Company not detected"));
      const incomplete = !d.role || !d.company;
      if (incomplete) {
        content.append(
          el("p", "warn", `We couldn't read the ${!d.role && !d.company ? "job title or company" : !d.role ? "job title" : "company"} on this page. Add it below — nothing is saved with guessed details.`),
        );
      } else {
        content.append(el("p", "note", `Read from this ${SOURCE_LABEL[d.sourceName] || "job"} page. Check that it's the right job.`));
      }
      if (!d.description)
        content.append(
          el("p", "note", "The job description isn't visible on this page yet. Open the full posting so it can be analysed."),
        );

      const manual = el("details", "manual");
      manual.open = st.manualOpen === null ? incomplete || !d.description : st.manualOpen;
      manual.addEventListener("toggle", () => { st.manualOpen = manual.open; });
      manual.append(el("summary", "label", "Paste job description"));
      const title = el("input");
      title.type = "text";
      title.placeholder = "Job title (optional)";
      title.setAttribute("aria-label", "Job title (optional)");
      title.dataset.key = "m-title";
      title.value = st.manual.title;
      title.addEventListener("input", (e) => { st.manual.title = e.target.value; });
      const company = el("input");
      company.type = "text";
      company.placeholder = "Company (optional)";
      company.setAttribute("aria-label", "Company (optional)");
      company.dataset.key = "m-company";
      company.value = st.manual.company;
      company.addEventListener("input", (e) => { st.manual.company = e.target.value; });
      const desc = el("textarea");
      desc.rows = 5;
      desc.placeholder = "Paste the full job description here…";
      desc.setAttribute("aria-label", "Job description");
      desc.dataset.key = "m-desc";
      desc.value = st.manual.description;
      desc.addEventListener("input", (e) => { st.manual.description = e.target.value; });
      manual.append(title, company, desc);
      content.append(manual);

      // which resume this job will use (chosen from the backend's list)
      const chosen = selectedResume();
      if (chosen && !st.selecting) {
        const line = el("p", "note", `Resume: ${chosen.name}`);
        if (st.resumes && st.resumes.length > 1) {
          line.append(" ", linkAction("Change", changeResume, "change"));
        }
        content.append(line);
      }

      if (st.selecting && st.resumes) {
        content.append(el("div", "label", "Select resume for this job"));
        const pick = el("div", "pick");
        pick.setAttribute("role", "radiogroup");
        pick.setAttribute("aria-label", "Resume for this job");
        const ids = st.resumes.map((r) => r.id);
        pick.addEventListener("keydown", (e) => {
          const dir = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
          if (!dir) return;
          e.preventDefault();
          const i = Math.max(0, ids.indexOf(st.pickId));
          st.pickId = ids[(i + dir + ids.length) % ids.length];
          render();
        });
        st.resumes.forEach((r, idx) => {
          const b = el("button", "");
          b.type = "button";
          b.dataset.key = `pick-${r.id}`;
          b.setAttribute("role", "radio");
          b.setAttribute("aria-checked", String(st.pickId === r.id));
          b.tabIndex = st.pickId === r.id || (!st.pickId && idx === 0) ? 0 : -1; // roving tabindex
          b.append(el("div", "pickName", r.name));
          b.append(
            el(
              "div",
              "pickMeta",
              [
                r.fileType ? r.fileType.toUpperCase() : null,
                r.createdAt ? new Date(r.createdAt).toLocaleDateString() : null,
                r.isActive ? "Active" : null,
              ]
                .filter(Boolean)
                .join(" · "),
            ),
          );
          b.addEventListener("click", () => {
            st.pickId = r.id;
            render();
          });
          pick.append(b);
        });
        content.append(pick);
        const sel = el("div", "row");
        sel.append(button("Continue to Analysis", continueWithSelection, { disabled: !st.pickId, key: "continue" }));
        sel.append(
          button("Cancel", () => { st.selecting = false; render(); }, { secondary: true, key: "cancel-select" }),
        );
        content.append(sel);
        return;
      }

      const busy = Boolean(st.busy);
      const row = el("div", "row");
      row.append(
        button(
          st.busy === "save" ? "Saving…" : st.saved ? (st.saved.duplicate ? "Already saved" : "✓ Saved") : "Save Job",
          saveJob,
          { secondary: true, disabled: busy, key: "save" },
        ),
        button(st.busy === "analyze" ? "Analyzing…" : "Analyze JD", analyze, { secondary: true, disabled: busy, key: "analyze" }),
        button("Tailor Resume", tailor, { disabled: busy, key: "tailor" }),
      );
      content.append(row);
      if (st.saved) {
        content.append(
          el("p", "note", `${st.saved.duplicate ? "Already in TrackTrail" : "Saved to TrackTrail"} as “${st.saved.status}”. Change its status any time in your dashboard.`),
        );
      }
      content.append(
        el("p", "note", "Analysis and tailoring only prepare a resume draft for you to review. TrackTrail never applies to jobs for you."),
      );

      if (st.busy === "tailor") {
        const idx = Math.max(0, STAGE_LABELS.findIndex(([k]) => k === st.stage));
        const bar = el("progress");
        bar.max = 5;
        bar.value = Math.min(5, idx + 1);
        bar.setAttribute("aria-label", "Tailoring progress");
        content.append(bar);
        const ol = el("ol", "steps");
        STAGE_LABELS.slice(0, 5).forEach(([k, label], i) => {
          const li = el("li", i < idx ? "done" : i === idx ? "active" : "", (i < idx ? "✓ " : "") + label);
          if (i === idx) li.setAttribute("aria-current", "step");
          ol.append(li);
        });
        content.append(ol);
        const r = el("div", "row");
        r.append(button("Cancel", cancelRun, { secondary: true, key: "cancel-run" }));
        content.append(r);
      } else if (st.busy === "analyze" || st.busy === "resumes") {
        content.append(el("p", "note", st.busy === "analyze" ? "Analyzing the job description…" : "Loading your resumes…"));
      }
      if (st.error) {
        const e = el("div", "err");
        e.append(el("div", "", st.error.message));
        if (st.error.kind === "session") e.append(el("div", "", "Click the TrackTrail toolbar icon to sign in, then retry."));
        const actions = el("div", "row");
        if (st.error.code === "no_resume" || st.error.code === "resume_unreadable") {
          actions.append(linkAction("Add your resume in TrackTrail", () => openWeb("/resumes"), "add-resume"));
        }
        if (st.lastAction && (st.error.retryable || st.error.kind === "session")) {
          actions.append(button("Retry", () => { const run = st.lastAction; st.error = null; run(); }, { secondary: true, key: "retry" }));
        }
        if (actions.childNodes.length) e.append(actions);
        content.append(e);
      }

      if (st.analysis) drawAnalysis(st.analysis);
      if (st.version) {
        const n = st.version.changes.length;
        const ok = el("div", "ok");
        ok.append(
          el(
            "div",
            "",
            n
              ? `${n} suggested change${n === 1 ? "" : "s"} are ready. Nothing is applied until you review them.`
              : "No safe improvements were found. Your resume is unchanged.",
          ),
        );
        ok.append(el("div", "", "This is a draft resume, not an application. Applying to the job is up to you, on the job site."));
        content.append(ok);
        content.append(button("Review in TrackTrail", () => openWeb(`/tailor?version=${st.version.id}`), { key: "review" }));
      }
    }

    // ------------------------------------------------------------- api
    panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation(); // don't also dismiss whatever the host page has open
        api.close();
      }
    });
    const api = {
      host,
      state: () => st,
      open() {
        if (!host.isConnected) doc.body.appendChild(host);
        chromeApi.storage?.local?.get?.(["tracktrail_theme"], (r) => {
          panel.classList.toggle("dark", r?.tracktrail_theme === "dark");
        });
        render();
        panel.focus({ preventScroll: true }); // keyboard/screen-reader users land inside the dialog
      },
      close() {
        st.cancelled = true;
        st.runId += 1;
        announce("");
        announceError("");
        const wasOpen = host.isConnected;
        host.remove();
        if (wasOpen && onClose) onClose();
      },
      // the visible posting changed (SPA navigation): forget stale results
      reset() {
        st = {
          ...st,
          busy: null,
          analysis: null,
          version: null,
          saved: null,
          error: null,
          stage: null,
          detected: null,
          cancelled: true,
          runId: st.runId + 1,
          lastAction: null,
          showAll: false,
          manualOpen: null,
          resumes: null,
          resumeId: null,
          resumeConfirmed: false,
          selecting: false,
          pickId: null,
          manual: { title: "", company: "", description: "" },
        };
        announce("");
        announceError("");
        if (host.isConnected) render();
      },
      isOpen: () => host.isConnected,
    };
    return api;
  }

  root.TrackTrailPanel = { createPanel, STAGE_LABELS };
})(typeof globalThis !== "undefined" ? globalThis : this);
