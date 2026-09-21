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
  .panel { position: fixed; right: 24px; bottom: 132px; width: 340px; max-height: 70vh; overflow: auto; z-index: 2147483000;
    background: #fff; color: #0f172a; border: 1px solid #e2e8f0; border-radius: 20px; box-shadow: 0 20px 48px rgba(2,6,23,.28);
    font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 16px; box-sizing: border-box; }
  .panel.dark { background: #0f172a; color: #e2e8f0; border-color: #334155; }
  .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .brand { font-weight: 800; letter-spacing: .02em; }
  .x { border: 0; background: transparent; font-size: 18px; cursor: pointer; color: inherit; }
  .title { font-weight: 700; font-size: 14px; margin: 2px 0 0; }
  .sub { color: #64748b; margin: 0 0 10px; }
  .dark .sub { color: #94a3b8; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0; }
  button.btn { border: 0; border-radius: 12px; padding: 8px 12px; font-weight: 700; font-size: 12px; cursor: pointer; background: #020617; color: #fff; }
  .dark button.btn { background: #0891b2; }
  button.btn.secondary { background: #e2e8f0; color: #0f172a; }
  .dark button.btn.secondary { background: #1e293b; color: #e2e8f0; }
  button.btn:disabled { opacity: .55; cursor: default; }
  .score { font-size: 34px; font-weight: 900; margin: 6px 0 0; }
  .label { text-transform: uppercase; font-size: 10px; font-weight: 800; color: #94a3b8; letter-spacing: .08em; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
  .chip { border-radius: 999px; padding: 3px 9px; font-size: 11px; font-weight: 700; }
  .chip.MATCHED { background: #d1fae5; color: #065f46; }
  .chip.PARTIAL_MATCH { background: #fef3c7; color: #92400e; }
  .chip.NOT_FOUND { background: #ffe4e6; color: #9f1239; }
  .note { color: #64748b; font-size: 11px; margin: 6px 0; }
  .err { background: #fff1f2; color: #9f1239; border-radius: 12px; padding: 10px; margin: 10px 0; }
  .dark .err { background: #4c0519; color: #fecdd3; }
  .ok { background: #ecfdf5; color: #065f46; border-radius: 12px; padding: 10px; margin: 10px 0; }
  .dark .ok { background: #064e3b; color: #a7f3d0; }
  ol.steps { list-style: none; padding: 0; margin: 8px 0; }
  ol.steps li { padding: 2px 0; color: #94a3b8; }
  ol.steps li.done { color: #059669; } ol.steps li.active { color: inherit; font-weight: 700; }
  .pick { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; }
  .pick button { text-align: left; border: 1px solid #cbd5e1; background: transparent; color: inherit; border-radius: 12px; padding: 8px 10px; cursor: pointer; font: inherit; }
  .dark .pick button { border-color: #334155; }
  .pick button[aria-checked="true"] { border-color: #0891b2; box-shadow: 0 0 0 1px #0891b2 inset; }
  .pick .pickName { font-weight: 700; word-break: break-word; }
  .pick .pickMeta { color: #64748b; font-size: 11px; }
  a.link { color: #0e7490; font-weight: 700; cursor: pointer; text-decoration: underline; }
  `;

  const STAGE_LABELS = [
    ["analyzing_resume", "Analyzing Resume…"], ["analyzing_jd", "Analyzing Job Description…"], ["matching", "Matching Requirements…"],
    ["generating", "Generating Tailored Resume…"], ["validating", "Validating Changes…"], ["ready", "Resume Ready"],
  ];
  const ICON = { MATCHED: "✓", PARTIAL_MATCH: "⚠", NOT_FOUND: "✕" };
  const MAX_CHIPS = 12;

  function createPanel({ doc, chromeApi, extract, hostname, sleep }) {
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
    panel.setAttribute("aria-label", "TrackTrail");
    shadow.append(style, panel);

    let st = { busy: null, detected: null, analysis: null, stage: null, version: null, saved: null, error: null, webUrl: null, cancelled: false, resumes: null, activeResumeId: null, resumeId: null, resumeConfirmed: false, selecting: false, pickId: null };

    const el = (tag, cls, txt) => {
      const n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (txt !== undefined) n.textContent = txt;
      return n;
    };
    const button = (label, onClick, { secondary = false, disabled = false } = {}) => {
      const b = el("button", `btn${secondary ? " secondary" : ""}`, label);
      b.type = "button";
      b.disabled = disabled;
      b.addEventListener("click", onClick);
      return b;
    };

    const send = (message) =>
      new Promise((resolve) => {
        try {
          if (!chromeApi.runtime?.id) return resolve({ ok: false, error: "The extension was updated. Reload this page.", code: "context_invalidated" });
          chromeApi.runtime.sendMessage(message, (r) => resolve(r || { ok: false, error: "No response from the extension." }));
        } catch (e) {
          resolve({ ok: false, error: "The extension was updated. Reload this page.", code: "context_invalidated" });
        }
      });

    const fail = (r) => { st.error = { message: r.error || "Something went wrong.", code: r.code || null }; st.busy = null; render(); };
    const webUrl = async () => {
      if (!st.webUrl) st.webUrl = (await send({ type: "GET_WEB_URL" })).url || null;
      return st.webUrl;
    };
    const openWeb = async (path) => {
      const base = await webUrl();
      if (base) root.open(`${base}${path}`, "_blank", "noopener");
    };

    // ---------------------------------------------------------- actions
    const detect = () => { st.detected = extract.detectJob(doc, root.location); return st.detected; };

    // ------------------------------------------------- resume selection
    // The BACKEND owns resumes. The panel only lists them (RESUME_LIST) and passes the chosen id along.
    async function ensureResumes() {
      if (st.resumes) return st.resumes;
      const r = await send({ type: "RESUME_LIST" });
      if (!r.ok) { fail(r); return null; }
      if (!r.resumes || !Array.isArray(r.resumes.resumes)) { fail({ error: "Unexpected response from TrackTrail. Please try again." }); return null; }
      st.resumes = r.resumes.resumes;
      st.activeResumeId = r.resumes.activeResumeId;
      return st.resumes;
    }
    const resumeById = (id) => (st.resumes || []).find((r) => r.id === id) || null;
    const selectedResume = () => resumeById(st.resumeId) || (st.resumes && st.resumes.length === 1 ? st.resumes[0] : null);

    async function changeResume() {
      st.busy = "resumes"; st.error = null; render();
      const list = await ensureResumes();
      st.busy = null;
      if (!list) return;
      st.selecting = true; st.pickId = st.resumeId || st.activeResumeId; render();
    }

    async function continueWithSelection() {
      if (!st.pickId) return;
      st.resumeId = st.pickId; st.resumeConfirmed = true; st.selecting = false;
      await analyze();                       // Select Resume -> Continue to Analysis ...
      if (st.analysis && !st.error) await runTailoring(); // ... -> Tailor Resume
    }

    async function saveJob() {
      const d = detect();
      st.busy = "save"; st.error = null; render();
      const r = await send({ type: "SAVE_JOB", job: extract.toSaveJob(d, hostname) });
      if (!r.ok) return fail(r);
      st.saved = { duplicate: Boolean(r.duplicate) }; st.busy = null; render();
    }

    async function analyze() {
      const d = detect();
      st.busy = "analyze"; st.error = null; st.analysis = null; st.version = null; render();
      const r = await send({ type: "RESUME_ANALYZE", job: extract.toApiJob(d), ...(st.resumeId ? { resumeId: st.resumeId } : {}) });
      if (!r.ok) return fail(r);
      st.analysis = r.analysis; st.busy = null; render();
    }

    // "Tailor Resume": 0 resumes -> ask the user to add one; 1 -> use it; several -> Select Resume first.
    async function tailor() {
      st.error = null; st.busy = "resumes"; render();
      const list = await ensureResumes();
      st.busy = null;
      if (!list) return;
      if (!list.length) return fail({ error: "Upload your resume before tailoring.", code: "no_resume" });
      if (list.length === 1) { st.resumeId = list[0].id; st.resumeConfirmed = true; }
      if (list.length > 1 && !st.resumeConfirmed) { st.selecting = true; st.pickId = st.resumeId || st.activeResumeId; render(); return; }
      await runTailoring();
    }

    async function runTailoring() {
      const d = detect();
      st.busy = "tailor"; st.error = null; st.version = null; st.stage = "analyzing_resume"; st.cancelled = false; render();
      const started = await send({ type: "RESUME_TAILOR", job: extract.toApiJob(d), ...(st.resumeId ? { resumeId: st.resumeId } : {}) });
      if (!started.ok) return fail(started);
      if (!started.session || !started.session.id) return fail({ error: "Unexpected response from TrackTrail. Please try again." });
      let session = started.session;
      const t0 = Date.now();
      while (session.status !== "succeeded" && session.status !== "failed") {
        if (st.cancelled) return;
        if (Date.now() - t0 > 180000) return fail({ error: "This is taking longer than expected. Please try again.", code: "timeout" });
        await sleep(1000);
        const p = await send({ type: "RESUME_SESSION", id: session.id });
        if (!p.ok) return fail(p);
        session = p.session;
        st.stage = session.stage; render();
      }
      if (session.status === "failed") return fail({ error: session.error, code: session.errorCode });
      const v = await send({ type: "RESUME_VERSION", id: session.versionId });
      if (!v.ok) return fail(v);
      st.version = v.version; st.analysis = v.version.analysis; st.busy = null; st.stage = "ready"; render();
    }

    // ----------------------------------------------------------- render
    function render() {
      panel.replaceChildren();
      const head = el("div", "head");
      head.append(el("span", "brand", "TrackTrail"));
      const x = button("×", () => api.close(), { secondary: true });
      x.className = "x"; x.setAttribute("aria-label", "Close");
      head.append(x);
      panel.append(head);

      const d = st.detected || detect();
      panel.append(el("p", "title", d.role || "Job detected"));
      panel.append(el("p", "sub", d.company || "Company not detected"));
      if (!d.description) panel.append(el("p", "note", "The job description isn't visible on this page yet. Open the full posting so it can be analysed."));

      // which resume this job will use (chosen from the backend's list)
      const chosen = selectedResume();
      if (chosen && !st.selecting) {
        const line = el("p", "note", `Resume: ${chosen.name}`);
        if (st.resumes && st.resumes.length > 1) {
          const change = el("a", "link", " Change");
          change.addEventListener("click", changeResume);
          line.append(change);
        }
        panel.append(line);
      }

      if (st.selecting && st.resumes) {
        panel.append(el("div", "label", "Select resume for this job"));
        const pick = el("div", "pick");
        pick.setAttribute("role", "radiogroup");
        st.resumes.forEach((r) => {
          const b = el("button", "");
          b.type = "button";
          b.setAttribute("role", "radio");
          b.setAttribute("aria-checked", String(st.pickId === r.id));
          b.append(el("div", "pickName", r.name));
          b.append(el("div", "pickMeta", [r.fileType ? r.fileType.toUpperCase() : null, r.createdAt ? new Date(r.createdAt).toLocaleDateString() : null, r.isActive ? "Active" : null].filter(Boolean).join(" · ")));
          b.addEventListener("click", () => { st.pickId = r.id; render(); });
          pick.append(b);
        });
        panel.append(pick);
        const sel = el("div", "row");
        sel.append(button("Continue to Analysis", continueWithSelection, { disabled: !st.pickId }));
        sel.append(button("Cancel", () => { st.selecting = false; render(); }, { secondary: true }));
        panel.append(sel);
        return;
      }

      const busy = Boolean(st.busy);
      const row = el("div", "row");
      row.append(
        button(st.busy === "save" ? "Saving…" : st.saved ? (st.saved.duplicate ? "Already saved" : "✓ Saved") : "Save Job", saveJob, { secondary: true, disabled: busy }),
        button(st.busy === "analyze" ? "Analyzing…" : "Analyze JD", analyze, { secondary: true, disabled: busy }),
        button("Tailor Resume", tailor, { disabled: busy }),
      );
      panel.append(row);

      if (st.busy === "tailor") {
        const ol = el("ol", "steps");
        const idx = Math.max(0, STAGE_LABELS.findIndex(([k]) => k === st.stage));
        STAGE_LABELS.slice(0, 5).forEach(([k, label], i) => ol.append(el("li", i < idx ? "done" : i === idx ? "active" : "", (i < idx ? "✓ " : "") + label)));
        panel.append(ol);
      }
      if (st.error) {
        const e = el("div", "err");
        e.append(el("div", "", st.error.message));
        if (st.error.code === "no_resume" || st.error.code === "resume_unreadable") {
          const a = el("a", "link", "Add your resume in TrackTrail");
          a.addEventListener("click", () => openWeb("/resumes"));
          e.append(a);
        }
        panel.append(e);
      }

      const a = st.analysis;
      if (a) {
        panel.append(el("div", "label", "Resume match"));
        panel.append(el("div", "score", a.matchScore === null || a.matchScore === undefined ? "—" : `${a.matchScore}%`));
        const chips = el("div", "chips");
        a.requirements.slice(0, MAX_CHIPS).forEach((r) => {
          const c = el("span", `chip ${r.state}`, `${ICON[r.state]} ${r.requirement}`);
          c.title = r.label;
          chips.append(c);
        });
        panel.append(chips);
        if (a.requirements.length > MAX_CHIPS) panel.append(el("p", "note", `+${a.requirements.length - MAX_CHIPS} more in the full analysis`));
        panel.append(el("p", "note", "Skills marked ✕ aren't on your resume, so they are never added to it."));
        const links = el("div", "row");
        links.append(button("View Full Analysis", () => openWeb(st.version ? `/tailor?version=${st.version.id}` : `/tailor?analysis=${encodeURIComponent(a.jobKey)}${a.resumeId ? `&resume=${a.resumeId}` : ""}`), { secondary: true }));
        panel.append(links);
      }
      if (st.version) {
        const n = st.version.changes.length;
        const ok = el("div", "ok");
        ok.append(el("div", "", n ? `${n} suggested change${n === 1 ? "" : "s"} are ready. Nothing is applied until you review them.` : "No safe improvements were found. Your resume is unchanged."));
        panel.append(ok);
        panel.append(button("Review in TrackTrail", () => openWeb(`/tailor?version=${st.version.id}`)));
      }
    }

    // ------------------------------------------------------------- api
    const api = {
      host,
      state: () => st,
      open() {
        if (!host.isConnected) doc.body.appendChild(host);
        chromeApi.storage?.local?.get?.(["tracktrail_theme"], (r) => { panel.classList.toggle("dark", r?.tracktrail_theme === "dark"); });
        render();
      },
      close() { st.cancelled = true; host.remove(); },
      // the visible posting changed (SPA navigation): forget stale results
      reset() { st = { ...st, busy: null, analysis: null, version: null, saved: null, error: null, stage: null, detected: null, cancelled: true, resumes: null, resumeId: null, resumeConfirmed: false, selecting: false, pickId: null }; if (host.isConnected) render(); },
      isOpen: () => host.isConnected,
    };
    return api;
  }

  root.TrackTrailPanel = { createPanel, STAGE_LABELS };
})(typeof globalThis !== "undefined" ? globalThis : this);
