// "My Resumes" section of the extension dashboard.
//
// The BACKEND is the single source of truth: every resume, version, active
// choice and file shown here is fetched from /api/resume/* (the same records
// the web client and mobile app use). Nothing is stored in the extension, and
// no tailoring/AI logic lives here. Uploads go ONLY to the TrackTrail backend,
// which does all validation (size, magic bytes, ZIP inspection), parsing and
// storage.
//
// All dependencies are injected so the module is testable in Node + jsdom:
//   api     { listResumes, getResume, activate, remove, upload, getVersion, exportVersion, downloadOriginal }
//   saveBlob(blob, filename)   openWeb(path)   confirmFn(message) -> boolean

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ["pdf", "docx"];
export const EXPORT_FORMATS = [["pdf", "PDF"], ["docx", "Word (.docx)"], ["txt", "Text"], ["md", "Markdown"], ["html", "HTML"]];

/**
 * Instant feedback only — the server is authoritative and re-validates
 * everything (magic bytes, ZIP structure, size). Not a substitute for it.
 */
export function validateFileForUpload(file) {
  if (!file) return "Choose a file first.";
  const ext = (/\.([A-Za-z0-9]+)$/.exec(file.name || "") || [])[1]?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) return "Only PDF and DOCX resumes are supported.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) return `That file is too large. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`;
  return null;
}

export function provenanceLabel(v) {
  if (v.aiUsed) return `AI-assisted · ${v.aiProvider || "provider"}${v.aiModel ? ` (${v.aiModel})` : ""}`;
  return v.aiProvider ? "Reorder-only (AI was unavailable)" : "Reorder-only (no AI)";
}

const TYPE_LABEL = { pdf: "PDF", docx: "DOCX", text: "Profile text" };

export function createResumeManager({ doc, api, saveBlob, openWeb, confirmFn, formatDate }) {
  const $ = (id) => doc.getElementById(id);
  const fmt = formatDate || ((d) => (d ? new Date(d).toLocaleDateString() : ""));
  const els = {
    list: $("resumesList"), empty: $("resumesEmpty"), error: $("resumesError"), msg: $("resumesMsg"),
    uploadBtn: $("resumeUploadBtn"), fileInput: $("resumeFileInput"), refresh: $("resumesRefresh"),
    viewer: $("resumeViewer"), viewerTitle: $("resumeViewerTitle"), viewerMeta: $("resumeViewerMeta"), viewerBody: $("resumeViewerBody"), viewerActions: $("resumeViewerActions"), viewerClose: $("resumeViewerClose"),
  };
  const state = { data: null, expanded: new Set(), busy: false };

  const el = (tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  // `ignoreBusy`: buttons created while a request is in flight but shown after it finishes (viewer actions)
  const btn = (label, onClick, { cls = "ghost-btn", disabled = false, title, ignoreBusy = false } = {}) => {
    const b = el("button", cls, label);
    b.type = "button";
    b.disabled = disabled || (state.busy && !ignoreBusy);
    if (title) b.title = title;
    b.addEventListener("click", onClick);
    return b;
  };

  function message(text, { error = false } = {}) {
    els.msg.textContent = error ? "" : text || "";
    els.error.textContent = error ? text || "" : "";
  }

  async function guarded(fn) {
    if (state.busy) return;
    state.busy = true;
    message("");
    render();
    try { await fn(); } catch (e) { message(e.message || "Something went wrong.", { error: true }); } finally { state.busy = false; render(); }
  }

  // ----------------------------------------------------------- viewer
  function openViewer({ title, meta, text, actions = [] }) {
    els.viewerTitle.textContent = title;
    els.viewerMeta.textContent = meta || "";
    els.viewerBody.textContent = text || "";
    els.viewerActions.replaceChildren(...actions);
    els.viewer.classList.remove("hidden");
  }
  function closeViewer() { els.viewer.classList.add("hidden"); }

  async function viewResume(r) {
    await guarded(async () => {
      const d = await api.getResume(r.id);
      const actions = r.hasFile ? [btn("Download original file", () => guarded(async () => saveBlob(...(await api.downloadOriginal(r.id)))), { cls: "ghost-btn", ignoreBusy: true })] : [];
      openViewer({ title: r.name, meta: `${TYPE_LABEL[r.fileType] || "Resume"} · uploaded ${fmt(r.createdAt)} · ${r.factsCount} facts parsed`, text: d.resumeText, actions });
    });
  }

  async function previewVersion(v) {
    await guarded(async () => {
      const full = await api.getVersion(v.id);
      openViewer({ title: `${v.targetTitle} — ${v.targetCompany}`, meta: `Tailored version · ${v.status} · created ${fmt(v.createdAt)}`, text: full.resumeText });
    });
  }

  async function exportVersion(v, format) {
    await guarded(async () => {
      try {
        saveBlob(...(await api.exportVersion(v.id, format)));
        message(`Exported “${v.targetTitle} — ${v.targetCompany}” as ${format.toUpperCase()}.`);
      } catch (e) {
        // drafts must be approved before they can be exported; approval happens in the web app
        message(e.message || "Export failed.", { error: true });
      }
    });
  }

  // ------------------------------------------------------------ actions
  const activate = (r) => guarded(async () => { state.data = await api.activate(r.id); message(`“${r.name}” will now be used for tailoring.`); });
  const remove = (r) => {
    const n = r.versionCount;
    const ok = confirmFn(`Delete “${r.name}”?${n ? ` This also deletes its ${n} tailored version${n === 1 ? "" : "s"}.` : ""} This cannot be undone.`);
    if (!ok) return undefined;
    return guarded(async () => { const out = await api.remove(r.id); state.data = out; message(`Deleted “${r.name}”${out.deletedVersions ? ` and ${out.deletedVersions} tailored version(s)` : ""}.`); });
  };
  const toggleVersions = (r) => { state.expanded.has(r.id) ? state.expanded.delete(r.id) : state.expanded.add(r.id); render(); };

  // ------------------------------------------------------------- render
  function versionRow(v) {
    const row = el("li", "resumeVersion");
    const info = el("div", "resumeVersionInfo");
    info.append(el("div", "resumeVersionTitle", `${v.targetTitle} — ${v.targetCompany}`));
    info.append(el("div", "resumeMeta", [`Created ${fmt(v.createdAt)}`, v.matchScore === null || v.matchScore === undefined ? null : `Match ${v.matchScore}%`, provenanceLabel(v), v.status].filter(Boolean).join(" · ")));
    const actions = el("div", "resumeActions");
    actions.append(btn("View", () => openWeb(`/tailor?version=${v.id}`), { title: "Open in TrackTrail to review the changes" }));
    actions.append(btn("Preview", () => previewVersion(v)));
    const select = el("select", "exportSelect");
    for (const [value, label] of EXPORT_FORMATS) { const o = el("option", "", label); o.value = value; select.append(o); }
    select.setAttribute("aria-label", "Export format");
    actions.append(select);
    actions.append(btn("Export", () => exportVersion(v, select.value)));
    row.append(info, actions);
    return row;
  }

  function card(r) {
    const c = el("article", `resumeCard${r.isActive ? " resumeCardActive" : ""}`);
    c.dataset.resumeId = String(r.id);

    const head = el("div", "resumeCardHead");
    const title = el("div", "resumeTitleBlock");
    title.append(el("div", "resumeName", r.name));
    title.append(el("div", "resumeMeta", `Uploaded ${fmt(r.createdAt)}`));
    const badges = el("div", "resumeBadges");
    badges.append(el("span", "badge badge-matched", TYPE_LABEL[r.fileType] || (r.fileType || "resume").toUpperCase()));
    badges.append(el("span", r.isActive ? "badge badge-offer" : "badge badge-new", r.isActive ? "Active" : "Available"));
    head.append(title, badges);
    c.append(head);

    const actions = el("div", "resumeActions");
    actions.append(btn("View", () => viewResume(r)));
    actions.append(btn(r.isActive ? "In use for tailoring" : "Use for Tailoring", () => activate(r), { disabled: r.isActive, cls: r.isActive ? "ghost-btn" : "ghost-btn ghost-btn-primary" }));
    actions.append(btn(`${state.expanded.has(r.id) ? "Hide" : "Versions"}${r.versionCount ? ` (${r.versionCount})` : ""}`, () => toggleVersions(r)));
    const isText = r.sourceType === "profile_text";
    actions.append(btn("Delete", () => remove(r), { cls: "ghost-btn ghost-btn-danger", disabled: isText, title: isText ? "This resume comes from your Profile text. Edit or clear it in Profile." : undefined }));
    c.append(actions);

    if (state.expanded.has(r.id)) {
      const panel = el("div", "resumeVersions");
      const orig = el("div", "resumeOriginal");
      orig.append(el("div", "resumeVersionTitle", "Original Resume"));
      orig.append(el("div", "resumeMeta", [`Uploaded ${fmt(r.createdAt)}`, `${r.factsCount} facts parsed`, r.isActive ? "Current / active" : "Not active"].join(" · ")));
      panel.append(orig);
      panel.append(el("div", "label-small", "Tailored versions"));
      if (!r.versions.length) panel.append(el("p", "hint", "None yet. Open a job on LinkedIn or Indeed and choose Tailor Resume."));
      else { const ul = el("ul", "resumeVersionList"); r.versions.forEach((v) => ul.append(versionRow(v))); panel.append(ul); }
      c.append(panel);
    }
    return c;
  }

  function render() {
    const resumes = state.data ? state.data.resumes : [];
    els.list.replaceChildren(...resumes.map(card));
    els.empty.classList.toggle("hidden", !state.data || resumes.length > 0);
    els.uploadBtn.disabled = state.busy;
    els.refresh.disabled = state.busy;
  }

  async function load() {
    await guarded(async () => { state.data = await api.listResumes(); });
  }

  // ------------------------------------------------------------- wiring
  els.uploadBtn.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", async () => {
    const file = els.fileInput.files && els.fileInput.files[0];
    els.fileInput.value = "";
    if (!file) return;
    const problem = validateFileForUpload(file);
    if (problem) return message(problem, { error: true });
    await guarded(async () => {
      const out = await api.upload(file); // -> TrackTrail backend only
      state.data = await api.listResumes();
      message(`Uploaded “${out.resume.name}”. It is now the resume used for tailoring.`);
    });
  });
  els.refresh.addEventListener("click", load);
  els.viewerClose.addEventListener("click", closeViewer);
  els.viewer.addEventListener("click", (e) => { if (e.target === els.viewer) closeViewer(); });

  return { load, render, state, closeViewer };
}
