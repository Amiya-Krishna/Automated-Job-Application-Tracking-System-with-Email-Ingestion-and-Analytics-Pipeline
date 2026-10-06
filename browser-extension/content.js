// Runs on job pages of LinkedIn, Indeed, Naukri, Internshala, Wellfound and Unstop. Detection lives in jd-extract.js
// (loaded first, see manifest.json) so it can be unit-tested; this file only
// wires the page UI: a compact "dock" (Save job + Resume match) and the popup's
// detection / open-panel messages. Nothing is invented: a field that can't be
// found on the page is never filled in, and one-click save is only offered when
// BOTH role and company were actually read.
const detectJob = () => TrackTrailExtract.detectJob(document, window.location);
const hasAnyDetails = (d) => Boolean(d.role || d.company);
const hasFullDetails = (d) => Boolean(d.role && d.company);
const looksLikeJobUrl = () => TrackTrailExtract.looksLikeJobPage(window.location);
const SOURCE_LABEL = { linkedin: "LinkedIn", indeed: "Indeed", naukri: "Naukri", internshala: "Internshala", wellfound: "Wellfound", unstop: "Unstop" };
const errorInfo = (r, fallback) => (globalThis.TrackTrailErrors ? TrackTrailErrors.describe(r, fallback) : { kind: "error", message: (r && r.error) || fallback, retryable: true });

let panel = null;
function openPanel() {
  if (!chrome.runtime?.id) return false;
  if (!panel) panel = TrackTrailPanel.createPanel({ hostname: window.location.hostname, onClose: () => dock.focusPanelButton() });
  if (!panel.isOpen()) panel.open();
  return true;
}

// Lets the popup ask "is there a job on the tab the user currently has open?"
// (same detectJob() the dock uses) and ask us to open the Resume Match panel.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "TT_GET_DETECTED_JOB") {
    const live = detectJob();
    // an empty company AND role means nothing was found on this page
    const found = hasAnyDetails(live);
    sendResponse({
      ok: true,
      found,
      complete: hasFullDetails(live),
      job: found ? live : null,
      saveJob: found ? TrackTrailExtract.toSaveJob(live, window.location.hostname) : null,
    });
    return false; // synchronous response
  }
  if (message?.type === "TT_OPEN_PANEL") {
    sendResponse({ ok: openPanel() });
    return false;
  }
  return false;
});

// --------------------------------------------------------------------- dock
const DOCK_CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .dock { position: fixed; right: 16px; bottom: 88px; z-index: 2147482000; display: flex; flex-direction: column; align-items: flex-end;
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; }
  .dock.left { right: auto; left: 16px; align-items: flex-start; }
  .card { width: 264px; max-width: calc(100vw - 32px); background: #fff; border: 1px solid #cbd5e1; border-radius: 16px; padding: 10px 12px;
    box-shadow: 0 12px 32px rgba(2, 6, 23, .22); }
  .dark .card { background: #0f172a; color: #e2e8f0; border-color: #334155; }
  .top { display: flex; align-items: flex-start; gap: 6px; }
  .info { flex: 1; min-width: 0; }
  .title, .sub { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .title { font-weight: 700; }
  .sub { color: #475569; font-size: 12px; }
  .dark .sub { color: #94a3b8; }
  .tools { display: flex; gap: 2px; }
  button { font: inherit; cursor: pointer; }
  .icon { min-width: 32px; min-height: 32px; border: 0; border-radius: 8px; background: transparent; color: inherit; font-size: 15px; line-height: 1; }
  .icon:hover { background: rgba(100, 116, 139, .18); }
  .actions { display: flex; gap: 6px; margin-top: 8px; }
  .btn { flex: 1; min-height: 36px; border-radius: 10px; padding: 6px 10px; font-weight: 700; font-size: 12px; border: 1px solid transparent; }
  .btn.primary { background: #020617; color: #fff; }
  .dark .btn.primary { background: #0e7490; }
  .btn.secondary { background: transparent; color: inherit; border-color: #94a3b8; }
  .btn:disabled { opacity: .7; cursor: default; }
  .status { margin: 6px 0 0; font-size: 12px; min-height: 0; }
  .status:empty { display: none; }
  .status.ok { color: #047857; } .status.warn { color: #92400e; } .status.err { color: #b91c1c; }
  .dark .status.ok { color: #6ee7b7; } .dark .status.warn { color: #fcd34d; } .dark .status.err { color: #fda4af; }
  .link { background: none; border: 0; padding: 0; margin-left: 4px; min-height: 24px; color: #0e7490; font-weight: 700; text-decoration: underline; }
  .dark .link { color: #67e8f9; }
  .mini { width: 44px; height: 44px; border-radius: 50%; border: 0; background: #020617; color: #fff; font-weight: 800; font-size: 13px; box-shadow: 0 8px 24px rgba(2, 6, 23, .3); }
  .dark .mini { background: #0e7490; }
  button:focus-visible { outline: 3px solid #22d3ee; outline-offset: 2px; }
  .hidden { display: none !important; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  @media (prefers-reduced-motion: no-preference) { .btn, .icon { transition: background .15s, opacity .15s; } }
`;

const dock = (() => {
  let host = null;
  let ui = null;
  let sig = "";
  let minimized = false;
  let left = false;
  let dark = false;
  let trackedFor = "";
  let tracked = null;
  let firstSeen = { href: window.location.href, at: Date.now() };
  let statusTimer = null;

  chrome.storage?.local?.get?.(["tracktrail_theme", "tracktrail_dock_left"], (r) => {
    dark = r?.tracktrail_theme === "dark";
    left = Boolean(r?.tracktrail_dock_left);
    if (ui) applyLook();
  });

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const btn = (cls, label, onClick, aria) => {
    const b = el("button", cls, label);
    b.type = "button";
    if (aria) b.setAttribute("aria-label", aria);
    b.addEventListener("click", onClick);
    return b;
  };
  const send = (message) =>
    new Promise((resolve) => {
      try {
        if (!chrome.runtime?.id) return resolve({ ok: false, error: "The extension was updated. Reload this page.", code: "context_invalidated" });
        chrome.runtime.sendMessage(message, (r) => resolve(chrome.runtime.lastError || !r ? { ok: false, error: "No response from the extension. Reload this page.", code: "context_invalidated" } : r));
      } catch (e) {
        resolve({ ok: false, error: "The extension was updated. Reload this page.", code: "context_invalidated" });
      }
    });

  function build() {
    host = document.createElement("div");
    host.id = "tracktrail-dock-host";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = DOCK_CSS;
    const root = el("div", "dock");
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "TrackTrail");

    const card = el("div", "card");
    const title = el("p", "title");
    const sub = el("p", "sub");
    const info = el("div", "info");
    info.append(title, sub);
    const moveBtn = btn("icon", "⇄", () => { left = !left; chrome.storage?.local?.set?.({ tracktrail_dock_left: left }); applyLook(); }, "Move TrackTrail to the other side of the page");
    const hideBtn = btn("icon", "–", () => { minimized = true; applyLook(); miniBtn.focus(); }, "Minimize TrackTrail");
    const tools = el("div", "tools");
    tools.append(moveBtn, hideBtn);
    const top = el("div", "top");
    top.append(info, tools);

    const saveBtn = btn("btn primary", "Save job", onSave);
    saveBtn.id = "tracktrail-save-btn";
    const panelBtn = btn("btn secondary", "Resume match", () => {
      if (!openPanel()) setStatus("Reload this page to use TrackTrail.", "warn");
    });
    panelBtn.id = "tracktrail-panel-btn";
    panelBtn.setAttribute("aria-haspopup", "dialog");
    const actions = el("div", "actions");
    actions.append(saveBtn, panelBtn);

    // two live regions: routine status is polite, failures are announced immediately
    const status = el("p", "status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const alertEl = el("p", "status err");
    alertEl.setAttribute("role", "alert");
    card.append(top, actions, status, alertEl);

    const miniBtn = btn("mini", "TT", () => { minimized = false; applyLook(); saveBtn.focus(); }, "Open TrackTrail");
    root.append(card, miniBtn);
    shadow.append(style, root);
    ui = { root, card, title, sub, saveBtn, panelBtn, status, alertEl, miniBtn };
    applyLook();
  }

  function applyLook() {
    ui.root.classList.toggle("dark", dark);
    ui.root.classList.toggle("left", left);
    ui.card.classList.toggle("hidden", minimized);
    ui.miniBtn.classList.toggle("hidden", !minimized);
  }

  function setStatus(text, kind = "ok", { persist = false, action } = {}) {
    clearTimeout(statusTimer);
    const target = kind === "err" ? ui.alertEl : ui.status;
    const other = kind === "err" ? ui.status : ui.alertEl;
    other.textContent = "";
    target.className = `status ${kind}`;
    target.textContent = text;
    if (action) target.append(btn("link", action.label, action.run));
    if (!persist) statusTimer = setTimeout(() => { if (ui) target.textContent = ""; }, 6000);
  }

  function setSave(label, { disabled = false } = {}) {
    ui.saveBtn.textContent = label;
    ui.saveBtn.disabled = disabled;
  }

  async function onSave() {
    if (!chrome.runtime?.id) return setStatus("Reload this page to use TrackTrail.", "warn", { persist: true });
    // Re-detect at click time — SPA navigation can change the visible posting without a reload.
    const live = detectJob();
    if (!hasFullDetails(live)) {
      return setStatus("Couldn't read the full job details. Open the TrackTrail toolbar icon to review and save.", "warn", { persist: true });
    }
    setSave("Saving…", { disabled: true });
    const r = await send({ type: "SAVE_JOB", job: TrackTrailExtract.toSaveJob(live, window.location.hostname) });
    if (r.ok) {
      const status = r.job?.status || "Applied";
      tracked = { id: r.job?.id, status };
      trackedFor = window.location.href;
      setSave(r.duplicate ? "✓ Already saved" : "✓ Saved", { disabled: true });
      setStatus(`${r.duplicate ? "Already in TrackTrail" : "Saved to TrackTrail"} as “${status}”. You can change its status in the dashboard.`, "ok", {
        persist: true,
        action: { label: "Open dashboard", run: () => send({ type: "OPEN_DASHBOARD" }) },
      });
      return;
    }
    setSave("Save job");
    const info = errorInfo(r, "Couldn't save this job.");
    if (info.kind === "session") setStatus(r.code === "account_blocked" ? info.message : "Sign in first: click the TrackTrail toolbar icon.", "err", { persist: true });
    else setStatus(`✕ ${info.message}`, "err", { persist: true, action: info.retryable ? { label: "Retry", run: onSave } : undefined });
  }

  async function checkTracked(saveJob, href) {
    if (trackedFor === href || !saveJob) return;
    trackedFor = href;
    const r = await send({ type: "CHECK_JOB_TRACKED", job: saveJob });
    if (window.location.href !== href || !ui) return; // navigated away meanwhile
    tracked = r.ok ? r.tracked : null;
    if (tracked) {
      setSave("✓ Already tracked", { disabled: true });
      setStatus(`This job is in TrackTrail as “${tracked.status}”.`, "ok", { persist: true });
    }
  }

  // Called from the poll. Creates / updates / removes the dock to match the page.
  function sync() {
    const href = window.location.href;
    const d = detectJob();
    if (firstSeen.href !== href) firstSeen = { href, at: Date.now() };
    const failedToRead = !hasAnyDetails(d) && looksLikeJobUrl() && Date.now() - firstSeen.at > 5000; // give the SPA time to render first
    if (!hasAnyDetails(d) && !failedToRead) return remove();

    const signature = [href, d.role, d.company, Boolean(d.description), failedToRead].join("|");
    if (!host) { build(); document.body.appendChild(host); }
    if (signature === sig) return;
    sig = signature;

    tracked = trackedFor === href ? tracked : null;
    ui.status.textContent = "";
    ui.alertEl.textContent = "";
    if (failedToRead) {
      ui.title.textContent = "Couldn't read this job";
      ui.sub.textContent = "The page layout may have changed.";
      ui.saveBtn.classList.add("hidden");
      ui.panelBtn.classList.add("hidden");
      const retry = btn("btn secondary", "Try again", () => { sig = ""; firstSeen.at = Date.now(); sync(); });
      retry.id = "tracktrail-retry-btn";
      ui.card.querySelector(".actions").append(retry);
      setStatus("Nothing was saved. Use the TrackTrail toolbar icon to add this job manually.", "warn", { persist: true });
      return;
    }
    ui.card.querySelector("#tracktrail-retry-btn")?.remove();
    ui.saveBtn.classList.remove("hidden");
    ui.panelBtn.classList.remove("hidden");
    ui.title.textContent = d.role || "Role not detected";
    ui.sub.textContent = [d.company || "Company not detected", SOURCE_LABEL[d.sourceName]].filter(Boolean).join(" · ");
    setSave("Save job");
    if (!hasFullDetails(d)) {
      ui.saveBtn.classList.add("hidden");
      setStatus("Some details couldn't be read, so one-tap save is off. Review them in the toolbar popup.", "warn", { persist: true });
    } else if (tracked) {
      setSave("✓ Already tracked", { disabled: true });
    } else {
      checkTracked(TrackTrailExtract.toSaveJob(d, window.location.hostname), href);
    }
  }

  function remove() {
    if (!host) return;
    host.remove();
    host = null;
    ui = null;
    sig = "";
  }

  return {
    sync,
    remove,
    focusPanelButton: () => ui?.panelBtn.focus(),
  };
})();

// Job sites are single-page apps — the URL changes without a full reload, so
// re-check periodically. When the URL changes, drop results for the previous
// posting (the dock re-evaluates against whatever job is now visible).
let lastHref = window.location.href;
const pollId = setInterval(() => {
  if (!chrome.runtime?.id) {
    clearInterval(pollId);
    return;
  }
  if (window.location.href !== lastHref) {
    lastHref = window.location.href;
    dock.remove();
    panel?.reset(); // results for the previous posting no longer apply
  }
  dock.sync();
}, 1500);

dock.sync();
