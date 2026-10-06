// ---------- messaging / small helpers ----------
const describe = (result, fallback) =>
  window.TrackTrailErrors.describe(result, fallback);

function sendMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        void chrome.runtime.lastError; // mark as handled
        resolve(
          response || {
            ok: false,
            error: "No response from the extension. Try again.",
            code: "network",
          },
        );
      });
    } catch (e) {
      resolve({ ok: false, error: "The extension isn't responding. Reopen this popup.", code: "network" });
    }
  });
}

const $ = (id) => document.getElementById(id);

// Short announcements for screen readers (the visible UI stays the source of truth).
function announce(text) {
  const live = $("popupLive");
  live.textContent = "";
  setTimeout(() => (live.textContent = text || ""), 30);
}

function h(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "disabled" || k === "value" || k === "selected") n[k] = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  n.append(...kids.filter((x) => x !== null && x !== undefined && x !== false));
  return n;
}

// Rebuilding a container would drop keyboard focus: restore it by data-key.
function rebuild(container, build) {
  const active = document.activeElement;
  const key = container.contains(active) ? active.dataset?.key : null;
  container.replaceChildren(...build().filter(Boolean));
  if (key) container.querySelector(`[data-key="${key}"]:not(:disabled)`)?.focus();
}

// ---------- element refs ----------
const views = { boot: $("bootView"), offline: $("offlineView"), out: $("loggedOutView"), in: $("loggedInView") };
const loginForm = $("loginForm");
const loginBtn = $("loginBtn");
const loginError = $("loginError");
const userChip = $("userChip");
const logoutBtn = $("logoutBtn");

const jobsList = $("jobsList");
const jobsEmpty = $("jobsEmpty");
const jobsEmptyText = $("jobsEmptyText");
const jobsEmptyAdd = $("jobsEmptyAdd");
const jobsError = $("jobsError");
const jobsLoading = $("jobsLoading");
const jobsLoadError = $("jobsLoadError");
const jobsLoadErrorText = $("jobsLoadErrorText");
const refreshJobsBtn = $("refreshJobsBtn");
const searchInput = $("searchInput");
const statusChips = $("statusChips");

const addJobForm = $("addJobForm");
const addJobBtn = $("addJobBtn");
const addJobMsg = $("addJobMsg");
const statsGrid = $("statsGrid");
const tabs = $("tabs");
const tabPanels = document.querySelectorAll(".tabPanel");
const pageBody = $("pageBody");
const netBanner = $("netBanner");
const netBannerText = $("netBannerText");

const registerForm = $("registerForm");
const registerBtn = $("registerBtn");
const registerError = $("registerError");
const toggleAuthMode = $("toggleAuthMode");
const authHint = $("authHint");
const forgotPasswordLink = $("forgotPasswordLink");
const confirmDialog = $("confirmDialog");
const confirmMessage = $("confirmMessage");
const confirmCancel = $("confirmCancel");
const confirmDelete = $("confirmDelete");

const STATUS_OPTIONS = ["Applied", "Interview", "Offer", "Rejected", "Wishlist"];

// ---------- state ----------
let allJobs = [];
let activeStatus = "all";
let searchTerm = "";
let pendingDelete = null;
let deleteDialogReturnFocus = null;
let sessionNotice = "";

function showView(name) {
  for (const [key, el] of Object.entries(views)) el.classList.toggle("hidden", key !== name);
  views.boot.setAttribute("aria-busy", String(name === "boot"));
}

function setMessage(el, message, kind = "error") {
  el.className = kind === "success" ? "success" : "error";
  el.textContent = message;
}

// If the failure means the session is over, go back to sign-in with a reason.
function handleSessionEnd(result) {
  if (describe(result).kind !== "session") return false;
  sessionNotice = result && result.code === "account_blocked" && result.error ? result.error : "Your session ended. Sign in again.";
  render();
  return true;
}

function showNetBanner(message) {
  netBannerText.textContent = message || "";
  netBanner.classList.toggle("hidden", !message);
}
window.addEventListener("offline", () =>
  showNetBanner("You're offline. Changes can't be saved until you reconnect."),
);
window.addEventListener("online", () => {
  showNetBanner("");
  if (!views.in.classList.contains("hidden")) {
    loadJobs();
    loadPage();
  }
});
if (!navigator.onLine) showNetBanner("You're offline. Changes can't be saved until you reconnect.");

// ---------- delete confirmation (custom, keyboard-safe) ----------
function closeDeleteDialog() {
  pendingDelete = null;
  confirmDialog.classList.add("hidden");
  views.in.inert = false;
  document.removeEventListener("keydown", onDeleteDialogKeydown);
  const target = deleteDialogReturnFocus;
  deleteDialogReturnFocus = null;
  if (target && target.isConnected && typeof target.focus === "function") target.focus();
  else refreshJobsBtn.focus();
}

function onDeleteDialogKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeDeleteDialog();
  } else if (event.key === "Tab") {
    // keep focus inside the dialog
    const items = [confirmCancel, confirmDelete].filter((b) => !b.disabled);
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
}

function askDelete(job) {
  pendingDelete = job;
  deleteDialogReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  confirmMessage.textContent = `Delete “${job.role || "this job"}” at ${job.company || "this company"}? This cannot be undone.`;
  confirmDialog.classList.remove("hidden");
  views.in.inert = true; // everything behind the dialog is unreachable
  document.addEventListener("keydown", onDeleteDialogKeydown);
  confirmCancel.focus(); // safest default: Cancel
}
confirmCancel.addEventListener("click", closeDeleteDialog);
confirmDialog.addEventListener("click", (event) => {
  if (event.target === confirmDialog) closeDeleteDialog();
});
confirmDelete.addEventListener("click", async () => {
  if (!pendingDelete) return;
  const job = pendingDelete;
  confirmDelete.disabled = true;
  confirmCancel.disabled = true;
  confirmDelete.textContent = "Deleting…";
  const result = await sendMessage({ type: "DELETE_JOB", id: job.id });
  confirmDelete.disabled = false;
  confirmCancel.disabled = false;
  confirmDelete.textContent = "Delete";
  if (result?.ok) {
    allJobs = allJobs.filter((item) => item.id !== job.id);
    closeDeleteDialog();
    renderJobs();
    setMessage(jobsError, "Job deleted.", "success");
    announce("Job deleted.");
    return;
  }
  closeDeleteDialog();
  if (handleSessionEnd(result)) return;
  setMessage(jobsError, describe(result, "Couldn't delete the job. Try again.").message);
});

// ---------- helpers ----------
function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusClass(status) {
  const normalized = (status || "Applied").trim();
  const match = STATUS_OPTIONS.find((k) => k.toLowerCase() === normalized.toLowerCase());
  return `status-${match || "Applied"}`;
}

// ---------- tabs (roving tabindex + arrow keys) ----------
function activateTab(btn, { focus = false } = {}) {
  for (const t of tabs.querySelectorAll(".tab")) {
    const on = t === btn;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
  }
  const targetId = btn.dataset.tab;
  for (const panel of tabPanels) panel.classList.toggle("hidden", panel.id !== targetId);
  if (focus) btn.focus();
  if (targetId === "statsTab") renderStats();
}
tabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (btn) activateTab(btn);
});
tabs.addEventListener("keydown", (e) => {
  const list = [...tabs.querySelectorAll(".tab")];
  const i = list.indexOf(document.activeElement);
  if (i < 0) return;
  const next = { ArrowRight: (i + 1) % list.length, ArrowLeft: (i - 1 + list.length) % list.length, Home: 0, End: list.length - 1 }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  activateTab(list[next], { focus: true });
});

// ---------- login / register toggle ----------
let authMode = "login";

toggleAuthMode.addEventListener("click", () => {
  if (authMode === "login") {
    authMode = "register";
    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");
    authHint.textContent = "Create an account to start tracking your applications.";
    toggleAuthMode.textContent = "Already have an account? Log in";
    $("regName").focus();
  } else {
    authMode = "login";
    registerForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
    authHint.textContent = "Sign in to manage your job applications right from your browser.";
    toggleAuthMode.textContent = "Don't have an account? Sign up";
    $("email").focus();
  }
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  registerError.textContent = "";
  registerBtn.disabled = true;
  registerBtn.textContent = "Creating account...";

  const name = $("regName").value.trim();
  const email = $("regEmail").value.trim();
  const password = $("regPassword").value;

  const result = await sendMessage({ type: "REGISTER", name, email, password });

  if (!result.ok) {
    registerBtn.disabled = false;
    registerBtn.textContent = "Create account";
    registerError.textContent = describe(result, "Registration failed").message;
    return;
  }

  // Auto-login with the same credentials right after signup.
  const loginResult = await sendMessage({ type: "LOGIN", email, password });

  registerBtn.disabled = false;
  registerBtn.textContent = "Create account";

  if (loginResult.ok) {
    registerForm.reset();
    render();
  } else {
    registerError.textContent = "Account created — please log in.";
    authMode = "login";
    registerForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
    toggleAuthMode.textContent = "Don't have an account? Sign up";
    $("email").value = email;
  }
});

// ---------- jobs rendering ----------
function applyFilters() {
  return allJobs.filter((job) => {
    const jobStatus = (job.status || "Applied").trim().toLowerCase();
    const matchesStatus = activeStatus === "all" || jobStatus === activeStatus.trim().toLowerCase();
    const haystack = `${job.company || ""} ${job.role || ""}`.toLowerCase();
    const matchesSearch = !searchTerm || haystack.includes(searchTerm);
    return matchesStatus && matchesSearch;
  });
}

function jobLabel(job) {
  return `${job.role || "job"} at ${job.company || "company"}`;
}

function noteEditor(job, notesWrap) {
  const noteBtn = () =>
    h("button", {
      type: "button",
      class: "jobItem-notes-text",
      text: job.notes || "+ Add note",
      "aria-label": job.notes ? `Edit note for ${jobLabel(job)}: ${job.notes}` : `Add note for ${jobLabel(job)}`,
    });
  const showNote = (focus) => {
    const b = noteBtn();
    b.addEventListener("click", edit);
    notesWrap.replaceChildren(b);
    if (focus) b.focus();
  };
  function edit() {
    const textarea = h("textarea", { class: "jobItem-notes-input", rows: 2, "aria-label": `Note for ${jobLabel(job)}` });
    textarea.value = job.notes || "";
    const saveBtn = h("button", { type: "button", class: "ghost-btn", text: "Save" });
    const cancelBtn = h("button", { type: "button", class: "ghost-btn", text: "Cancel" });
    notesWrap.replaceChildren(textarea, h("div", { class: "jobItem-notes-actions" }, saveBtn, cancelBtn));
    textarea.focus();
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.stopPropagation(); showNote(true); }
    });
    cancelBtn.addEventListener("click", () => showNote(true));
    saveBtn.addEventListener("click", async () => {
      const value = textarea.value.trim();
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
      const result = await sendMessage({ type: "UPDATE_JOB", id: job.id, updates: { notes: value } });
      if (result?.ok) {
        job.notes = value;
        showNote(true);
        announce("Note saved.");
      } else {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save";
        if (!handleSessionEnd(result)) setMessage(jobsError, describe(result, "Couldn't save the note.").message);
      }
    });
  }
  showNote(false);
}

function renderJobs() {
  jobsList.replaceChildren();
  jobsError.textContent = "";
  jobsLoadError.classList.add("hidden");
  jobsLoading.classList.add("hidden");

  const filtered = applyFilters();

  if (filtered.length === 0) {
    const none = allJobs.length === 0;
    jobsEmptyText.textContent = none
      ? "No saved jobs yet. Open a job on LinkedIn, Indeed, Naukri, Internshala, Wellfound or Unstop and save it, or add one manually."
      : "No jobs match these filters.";
    jobsEmptyAdd.classList.toggle("hidden", !none);
    jobsEmpty.classList.remove("hidden");
    return;
  }
  jobsEmpty.classList.add("hidden");

  for (const job of filtered) {
    const li = h("li", { class: "jobItem" });

    const badge = h("span", { class: `status-badge ${statusClass(job.status)}`, text: job.status || "Applied" });
    // Direct link to the original posting (only real http(s) URLs are rendered as links).
    const postingUrl = /^https?:\/\//i.test(job.sourceUrl || "") ? job.sourceUrl : null;
    li.append(
      h("div", { class: "jobItem-top" },
        h("div", {},
          h("div", { class: "jobItem-role", text: job.role || "Untitled role" }),
          h("div", { class: "jobItem-company", text: job.company || "Unknown company" }),
          postingUrl ? h("a", { class: "jobItem-link", href: postingUrl, target: "_blank", rel: "noopener noreferrer", title: postingUrl, text: "View posting ↗" }) : null),
        badge));

    // Notes: activate to edit inline (same UPDATE_JOB message the status select uses).
    const notesWrap = h("div", { class: "jobItem-notes" });
    noteEditor(job, notesWrap);
    li.append(notesWrap);

    const select = h("select", { class: "jobItem-status-select", "aria-label": `Status for ${jobLabel(job)}` });
    for (const opt of STATUS_OPTIONS) {
      select.append(h("option", { value: opt, text: opt, selected: (job.status || "Applied") === opt }));
    }
    select.addEventListener("change", async () => {
      const prevStatus = job.status || "Applied";
      select.disabled = true;
      const result = await sendMessage({ type: "UPDATE_JOB", id: job.id, updates: { status: select.value } });
      select.disabled = false;
      if (result?.ok) {
        job.status = select.value;
        badge.textContent = select.value;
        badge.className = `status-badge ${statusClass(select.value)}`;
        announce(`Status changed to ${select.value}.`);
      } else {
        select.value = prevStatus;
        if (!handleSessionEnd(result)) setMessage(jobsError, describe(result, "Couldn't update the status.").message);
      }
    });

    li.append(
      h("div", { class: "jobItem-actions" },
        select,
        h("span", { class: "jobItem-date", text: formatDate(job.createdAt) }),
        h("button", {
          class: "delete-btn",
          type: "button",
          text: "Delete",
          title: "Delete",
          "aria-label": `Delete ${jobLabel(job)}`,
          onclick: () => askDelete(job),
        })));

    jobsList.append(li);
  }
}

async function loadJobs() {
  jobsError.textContent = "";
  jobsLoadError.classList.add("hidden");
  jobsEmpty.classList.add("hidden");
  jobsList.replaceChildren();
  jobsLoading.classList.remove("hidden");
  refreshJobsBtn.disabled = true;

  const result = await sendMessage({ type: "GET_JOBS" });

  refreshJobsBtn.disabled = false;
  jobsLoading.classList.add("hidden");
  if (result?.ok) {
    allJobs = Array.isArray(result.jobs) ? result.jobs : [];
    renderJobs();
    return;
  }
  if (handleSessionEnd(result)) return;
  const info = describe(result, "Couldn't load your saved jobs.");
  jobsLoadErrorText.textContent = info.message;
  $("jobsRetryBtn").classList.toggle("hidden", !info.retryable);
  jobsLoadError.classList.remove("hidden");
}
$("jobsRetryBtn").addEventListener("click", loadJobs);

statusChips.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  for (const c of statusChips.querySelectorAll(".chip")) {
    c.classList.remove("active");
    c.setAttribute("aria-pressed", "false");
  }
  chip.classList.add("active");
  chip.setAttribute("aria-pressed", "true");
  activeStatus = chip.dataset.status;
  renderJobs();
});

searchInput.addEventListener("input", () => {
  searchTerm = searchInput.value.trim().toLowerCase();
  renderJobs();
});

refreshJobsBtn.addEventListener("click", () => {
  loadJobs();
  loadPage();
});

jobsEmptyAdd.addEventListener("click", () => activateTab($("tab-addTab"), { focus: true }));

// ---------- add job ----------
addJobForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  addJobMsg.className = "error";
  addJobMsg.textContent = "";
  addJobBtn.disabled = true;
  addJobBtn.textContent = "Adding...";

  const job = {
    company: $("addCompany").value.trim(),
    role: $("addRole").value.trim(),
    status: $("addStatus").value,
    interviewDate: $("addInterviewDate").value || null,
    notes: $("addNotes").value.trim(),
  };

  const result = await sendMessage({ type: "SAVE_JOB", job });

  addJobBtn.disabled = false;
  addJobBtn.textContent = "Add job";

  if (result?.ok) {
    addJobForm.reset();
    addJobMsg.className = "success";
    addJobMsg.textContent = result.duplicate ? "That job is already saved." : "Job added.";
    setTimeout(() => (addJobMsg.textContent = ""), 3000);
    await loadJobs();
  } else if (!handleSessionEnd(result)) {
    addJobMsg.textContent = describe(result, "Couldn't add the job.").message;
  }
});

// ---------- stats ----------
function renderStats() {
  const counts = Object.fromEntries(STATUS_OPTIONS.map((k) => [k, 0]));
  for (const job of allJobs) {
    const raw = (job.status || "Applied").trim();
    const key = STATUS_OPTIONS.find((k) => k.toLowerCase() === raw.toLowerCase()) || "Applied";
    counts[key] += 1;
  }
  const card = (num, label, cls = "") =>
    h("div", { class: `statCard ${cls}`.trim() }, h("div", { class: "num", text: String(num) }), h("div", { class: "label", text: label }));
  statsGrid.replaceChildren(card(allJobs.length, "Total tracked", "total"), ...Object.entries(counts).map(([label, num]) => card(num, label)));
}

// ---------- open dashboard / password reset ----------
const openDashboard = (hash = "") => chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html${hash}`) });
$("openDashboardBtn").addEventListener("click", () => openDashboard());

// Password reset isn't duplicated here — it reuses the web app's existing
// /forgot-password -> email link -> /reset-password flow, the same backend
// endpoints the web client already calls. The extension just opens that page.
forgotPasswordLink.addEventListener("click", async () => {
  const { url } = await sendMessage({ type: "GET_WEB_URL" });
  // ?source=extension tells the web Forgot/Reset Password pages (and, via the
  // forgot-password request they make, the backend) that this request started
  // in the extension, so the emailed link comes back branded for it.
  chrome.tabs.create({ url: `${(url || "").replace(/\/+$/, "")}/forgot-password?source=extension` });
});

// ---------- THIS PAGE: Detect → Understand → Save / Analyze → Confirm → Open ----------
// phase: loading | unsupported | not_ready | none | error | ready | tracked | saved
const page = { phase: "loading", saveJob: null, job: null, tracked: null, error: null, saving: false, opening: false, status: "Applied", incomplete: false, source: "", typed: { role: null, company: null } };
const SOURCE_LABEL = { linkedin: "LinkedIn", indeed: "Indeed", naukri: "Naukri", internshala: "Internshala", wellfound: "Wellfound", unstop: "Unstop" };

function stateBox(kind, text, ...actions) {
  return h("div", { class: `stateBox ${kind}` }, h("p", { class: "stateBox-text", text }), ...actions);
}

function inlineError(retry) {
  if (!page.error) return null;
  const info = page.error;
  return h("div", { class: "stateBox err", role: "alert" },
    h("p", { class: "stateBox-text", text: info.message }),
    info.retryable && retry ? h("button", { type: "button", class: "secondary", "data-key": "retry", text: "Retry", onclick: retry }) : null);
}

function buildPage() {
  switch (page.phase) {
    case "loading":
      return [h("div", { class: "skeleton", style: "height: 60px", "aria-hidden": "true" }), h("span", { class: "sr-only", text: "Checking this page…" })];
    case "unsupported":
      return [stateBox("neutral", "Open a job posting on LinkedIn, Indeed, Naukri, Internshala, Wellfound or Unstop to save it here in one tap.")];
    case "not_ready":
      return [stateBox("warn", "TrackTrail can't read this page yet. Reload the job page, then check again.",
        h("button", { type: "button", class: "secondary", "data-key": "recheck", text: "Check again", onclick: loadPage }))];
    case "none":
      return [stateBox("neutral", "No job found on this page. Open a specific job listing, then check again.",
        h("button", { type: "button", class: "secondary", "data-key": "recheck", text: "Check again", onclick: loadPage }))];
    case "error":
      return [stateBox("err", page.error?.message || "Couldn't check this page.",
        h("button", { type: "button", class: "secondary", "data-key": "recheck", text: "Try again", onclick: loadPage }))];
    default:
      return buildJobCard();
  }
}

const pageRole = () => page.typed.role ?? page.job?.role ?? "";
const pageCompany = () => page.typed.company ?? page.job?.company ?? "";

function buildJobCard() {
  const job = page.job || {};
  const nodes = [
    h("div", { class: "jobBrief" },
      h("p", { class: "jobBrief-title", text: job.role || "Role not detected" }),
      h("p", { class: "jobBrief-sub", text: [job.company || "Company not detected", SOURCE_LABEL[page.source]].filter(Boolean).join(" · ") }),
      page.phase === "ready" ? h("p", { class: "jobBrief-note", text: "Read from this page. Check it's the right job before saving." }) : null),
  ];

  if (page.phase === "tracked" || page.phase === "saved") {
    const status = page.tracked?.status || page.status;
    nodes.push(
      h("div", { class: "stateBox ok", role: "status" },
        h("p", { class: "stateBox-text", text: page.phase === "saved" ? `✓ Saved to TrackTrail as “${status}”.` : `✓ Already in TrackTrail as “${status}”.` }),
        h("p", { class: "stateBox-sub", text: "Change its status any time in the Jobs list below or in your dashboard." }),
        h("button", { type: "button", class: "secondary", "data-key": "open-dash", text: "Open in dashboard ↗", onclick: () => openDashboard("#applicationsTab") })));
  } else {
    if (page.incomplete) {
      const missing = !job.role && !job.company ? "job title or company" : !job.role ? "job title" : "company";
      nodes.push(h("p", { class: "stateBox-text warnText", text: `We couldn't read the ${missing} on this page. Fill it in to save — nothing is saved with guessed details.` }));
      // typed values live in page.typed so a re-render (saving, retry) never loses them
      const roleIn = h("input", { type: "text", id: "pageRole", "data-key": "in-role", placeholder: "Job title", "aria-label": "Job title", value: page.typed.role ?? job.role ?? "" });
      const companyIn = h("input", { type: "text", id: "pageCompany", "data-key": "in-company", placeholder: "Company", "aria-label": "Company", value: page.typed.company ?? job.company ?? "" });
      const sync = () => {
        page.typed = { role: roleIn.value, company: companyIn.value };
        const btn = pageBody.querySelector('[data-key="save"]');
        if (btn) btn.disabled = page.saving || !roleIn.value.trim() || !companyIn.value.trim();
      };
      roleIn.addEventListener("input", sync);
      companyIn.addEventListener("input", sync);
      nodes.push(roleIn, companyIn);
    }
    const statusSel = h("select", { id: "pageStatus", "data-key": "status", "aria-label": "Save as status" });
    for (const opt of STATUS_OPTIONS) statusSel.append(h("option", { value: opt, text: opt, selected: page.status === opt }));
    statusSel.addEventListener("change", () => (page.status = statusSel.value));
    nodes.push(
      h("div", { class: "saveRow" }, h("label", { for: "pageStatus", text: "Save as" }), statusSel),
      h("button", {
        type: "button",
        "data-key": "save",
        text: page.saving ? "Saving…" : "Save job",
        disabled: page.saving || (page.incomplete && !(pageRole().trim() && pageCompany().trim())),
        onclick: savePageJob,
      }));
  }

  nodes.push(
    h("button", {
      type: "button",
      class: "secondary",
      "data-key": "match",
      text: page.opening ? "Opening…" : "Check resume match",
      disabled: page.opening,
      "aria-describedby": "matchHint",
      onclick: openMatchPanel,
    }),
    h("p", { id: "matchHint", class: "jobBrief-note", text: "Opens the TrackTrail panel on the page to compare and tailor your resume. It only prepares a draft for you to review — nothing is submitted." }),
    inlineError(page.error?.retry));
  return nodes;
}

function renderPage() {
  rebuild(pageBody, buildPage);
  pageBody.setAttribute("aria-busy", String(page.phase === "loading"));
}

async function loadPage() {
  page.phase = "loading";
  page.error = null;
  page.saving = false;
  page.typed = { role: null, company: null };
  renderPage();
  const r = await sendMessage({ type: "GET_DETECTED_JOB" });
  if (!r.ok) {
    if (handleSessionEnd(r)) return;
    page.phase = "error";
    page.error = describe(r, "Couldn't check this page.");
  } else if (!r.supported) {
    page.phase = "unsupported";
  } else if (r.reason === "not_ready") {
    page.phase = "not_ready";
  } else if (!r.found || !r.job) {
    page.phase = "none";
  } else {
    page.job = r.job;
    page.saveJob = r.saveJob;
    page.source = r.job.sourceName || "";
    page.incomplete = !(r.job.role && r.job.company);
    page.tracked = r.tracked || null;
    page.phase = r.tracked ? "tracked" : "ready";
    announce(`Job detected: ${r.job.role || "role not detected"}${r.job.company ? ` at ${r.job.company}` : ""}${r.tracked ? ". Already tracked." : ""}`);
  }
  renderPage();
}

async function savePageJob() {
  if (!page.saveJob || page.saving) return;
  const payload = { ...page.saveJob, status: page.status };
  if (page.incomplete) {
    // never persist placeholders: only what was read, or what the user typed
    payload.role = pageRole().trim();
    payload.company = pageCompany().trim();
    if (!payload.role || !payload.company) return;
  }
  page.saving = true;
  page.error = null;
  renderPage();
  const result = await sendMessage({ type: "SAVE_JOB", job: payload });
  page.saving = false;
  if (result?.ok) {
    page.tracked = { id: result.job?.id, status: result.job?.status || payload.status };
    page.phase = result.duplicate ? "tracked" : "saved";
    announce(result.duplicate ? "This job was already in TrackTrail." : `Saved as ${page.tracked.status}.`);
    renderPage();
    loadJobs();
    return;
  }
  if (handleSessionEnd(result)) return;
  page.error = { ...describe(result, "Couldn't save this job."), retry: savePageJob };
  renderPage();
}

async function openMatchPanel() {
  page.opening = true;
  page.error = null;
  renderPage();
  const result = await sendMessage({ type: "OPEN_PANEL" });
  page.opening = false;
  if (result?.ok) {
    window.close(); // hand over to the on-page panel
    return;
  }
  page.error = { ...describe(result, "Couldn't open the panel on this page."), retry: openMatchPanel };
  renderPage();
}

// ---------- session / login / logout ----------
async function render() {
  showView("boot");
  const session = await sendMessage({ type: "GET_SESSION" });

  if (session.ok && session.loggedIn) {
    userChip.textContent = session.user?.name || session.user?.email || "";
    userChip.title = session.user?.email || "";
    showView("in");
    await Promise.all([loadJobs(), loadPage()]);
    return;
  }
  if (session.ok) {
    showView("out");
    loginError.textContent = sessionNotice || session.notice || (session.expired ? "Your session ended. Sign in again." : "");
    sessionNotice = "";
    (authMode === "login" ? $("email") : $("regName")).focus();
    return;
  }
  // couldn't check the session (offline / server trouble): keep it, let the user retry
  const info = describe(session, "Couldn't reach TrackTrail.");
  $("offlineText").textContent = info.message;
  showView("offline");
  $("offlineRetryBtn").focus();
}
$("offlineRetryBtn").addEventListener("click", render);

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in...";

  const email = $("email").value.trim();
  const password = $("password").value;

  const result = await sendMessage({ type: "LOGIN", email, password });

  loginBtn.disabled = false;
  loginBtn.textContent = "Log in";

  if (result.ok) {
    $("password").value = "";
    render();
  } else {
    loginError.textContent = describe(result, "Login failed").message;
  }
});

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;
  await sendMessage({ type: "LOGOUT" });
  logoutBtn.disabled = false;
  allJobs = [];
  render();
});

render();

// Theme toggle — wired for both the logged-out and logged-in headers
// (two separate buttons since they're in different, mutually-exclusive views).
// window.TrackTrailTheme comes from theme.js, loaded as a plain script ahead of
// this module script in popup.html.
window.TrackTrailTheme.wireThemeToggle("themeToggleBtn");
window.TrackTrailTheme.wireThemeToggle("themeToggleBtnIn");
