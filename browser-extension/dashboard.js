import { DEFAULT_API_BASE_URL, DEFAULT_WEB_APP_URL } from "./config.js";
import { createResumeManager } from "./resume-manager.js";
import { createResumeApi } from "./resume-api.js";

async function getApiBaseUrl() {
  const { apiBaseUrl } = await chrome.storage.local.get("apiBaseUrl");
  return (apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

// Gmail routes require the same auth token the popup uses for /api/jobs.
async function apiAuth(path, options = {}) {
  const result = await chrome.runtime.sendMessage({ type: "API_REQUEST", path, options });
  if (!result?.ok) {
    throw Object.assign(new Error(result?.error || "Couldn't reach TrackTrail."), { code: result?.code || null, retryAfterSeconds: result?.retryAfterSeconds || null });
  }
  return result.data;
}

// ---------- shared state helpers ----------
// Same classifier as popup/panel (ui-errors.js): consistent wording and Retry rules.
function errInfo(err, fallback) {
  return window.TrackTrailErrors.describe({ error: err?.message, code: err?.code, retryAfterSeconds: err?.retryAfterSeconds }, fallback);
}

// Show a failure in an error <p role="alert"> with a Retry button when it can help.
function setError(el, err, retry) {
  document.querySelectorAll(".skeleton").forEach((n) => n.remove());
  const info = errInfo(err);
  el.className = "error";
  el.textContent = info.kind === "session" ? "Your session ended. Open the TrackTrail toolbar icon, sign in, then retry." : info.message;
  if (retry && (info.retryable || info.kind === "session")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ghost-btn";
    btn.textContent = "Retry";
    btn.addEventListener("click", () => { el.textContent = ""; retry(); });
    el.append(" ", btn);
  }
}

// A saved job's own posting link. Only real http(s) URLs become clickable: the value
// comes from the database and must never turn into a javascript:/internal: href.
const isWebUrl = (u) => typeof u === "string" && /^https?:\/\//i.test(u);
function postingLink(url, className = "dcard-link") {
  if (!isWebUrl(url)) return null;
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.className = className;
  a.textContent = "View posting ↗";
  a.title = url;
  return a;
}

// Loading placeholders (removed by the loader once data or an error arrives).
function skeleton(container, count = 3, tag = "div") {
  for (let i = 0; i < count; i += 1) {
    const n = document.createElement(tag);
    n.className = "skeleton";
    n.setAttribute("aria-hidden", "true");
    container.appendChild(n);
  }
}
function clearSkeletons() { document.querySelectorAll(".skeleton").forEach((n) => n.remove()); }

// Build text nodes only — scraped/third-party values are never parsed as HTML.
function cell(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  n.textContent = text;
  return n;
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function confirmDialog(message) {
  const dialog = document.getElementById("dashboardConfirm");
  const body = document.getElementById("dashboardConfirmMessage");
  const cancel = document.getElementById("dashboardConfirmCancel");
  const confirm = document.getElementById("dashboardConfirmDelete");
  const shell = document.querySelector(".shell") || document.querySelector("main");
  const returnTo = document.activeElement;
  body.textContent = message;
  dialog.classList.remove("hidden");
  if (shell) shell.inert = true; // nothing behind the dialog is reachable
  cancel.focus(); // safest default
  return new Promise((resolve) => {
    const close = (result) => {
      dialog.classList.add("hidden");
      if (shell) shell.inert = false;
      cancel.onclick = null; confirm.onclick = null; dialog.onkeydown = null;
      if (returnTo && returnTo.isConnected) returnTo.focus();
      resolve(result);
    };
    cancel.onclick = () => close(false);
    confirm.onclick = () => close(true);
    dialog.onkeydown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); close(false); }
      else if (event.key === "Tab") {
        const first = cancel, last = confirm;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
  });
}

// ---------- sidebar nav ----------
const dashTabs = document.getElementById("dashTabs");
const dashPanels = document.querySelectorAll(".dashPanel");
const pageTitle = document.getElementById("pageTitle");
const pageDesc = document.getElementById("pageDesc");

dashTabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-item");
  if (!btn) return;
  for (const t of dashTabs.querySelectorAll(".nav-item")) { t.classList.remove("active"); t.removeAttribute("aria-current"); }
  btn.classList.add("active");
  btn.setAttribute("aria-current", "page");

  const targetId = btn.dataset.tab;
  for (const panel of dashPanels) panel.classList.toggle("hidden", panel.id !== targetId);

  pageTitle.textContent = btn.dataset.title || "";
  pageDesc.textContent = btn.dataset.desc || "";

  if (targetId === "applicationsTab") loadApplications();
  if (targetId === "analyticsTab") loadAnalytics();
  if (targetId === "companiesTab") loadCompanies();
  if (targetId === "sourcesTab") loadSources();
  if (targetId === "profileTab") loadProfile();
  if (targetId === "resumesTab") resumeManager.load();
  if (targetId === "emailTab") loadGmailStatus();
});

// Deep links from the popup, e.g. dashboard.html#applicationsTab
function openTabFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const btn = id && dashTabs.querySelector(`.nav-item[data-tab="${CSS.escape(id)}"]`);
  if (btn) btn.click();
}
window.addEventListener("hashchange", openTabFromHash);

// ============================================================
// MATCHED JOBS
// ============================================================
const matchedList = document.getElementById("matchedList");
const matchedEmpty = document.getElementById("matchedEmpty");
const matchedError = document.getElementById("matchedError");
const matchedStatus = document.getElementById("matchedStatus");
const matchedMinScore = document.getElementById("matchedMinScore");
const matchedRefresh = document.getElementById("matchedRefresh");
const matchedPrev = document.getElementById("matchedPrev");
const matchedNext = document.getElementById("matchedNext");
const matchedPageLabel = document.getElementById("matchedPageLabel");

let matchedPage = 1;
const matchedPageSize = 12;

function scoreBadgeClass(score) {
  if (score >= 70) return "badge-score-high";
  if (score >= 40) return "badge-score-mid";
  return "badge-score-low";
}

function statusBadgeClass(status) {
  const known = ["new", "matched", "applied", "duplicate"];
  return known.includes(status) ? `badge-${status}` : "badge-new";
}

async function loadMatchedJobs() {
  matchedError.textContent = "";
  matchedList.innerHTML = "";
  matchedEmpty.classList.add("hidden");
  skeleton(matchedList, 4);

  const params = new URLSearchParams();
  if (matchedStatus.value) params.set("status", matchedStatus.value);
  if (matchedMinScore.value) params.set("minScore", matchedMinScore.value);
  params.set("page", matchedPage);
  params.set("pageSize", matchedPageSize);

  try {
    const result = await apiAuth(`/engine/jobs?${params.toString()}`);
    clearSkeletons();
    const jobs = result.data || [];
    matchedPageLabel.textContent = `Page ${matchedPage}`;

    if (jobs.length === 0) {
      matchedEmpty.classList.remove("hidden");
      return;
    }

    for (const job of jobs) {
      const bestScore = job.match_scores?.[0]?.score;
      const card = document.createElement("div");
      card.className = "dcard";

      const title = document.createElement("div");
      title.className = "dcard-title";
      title.textContent = job.title || "Untitled role";

      const sub = document.createElement("div");
      sub.className = "dcard-sub";
      sub.textContent = [job.companies?.name, job.location, job.remote_type].filter(Boolean).join(" · ");

      const meta = document.createElement("div");
      meta.className = "dcard-meta";

      if (bestScore != null) {
        const scoreBadge = document.createElement("span");
        scoreBadge.className = `badge ${scoreBadgeClass(Number(bestScore))}`;
        scoreBadge.textContent = `Match ${Number(bestScore).toFixed(0)}`;
        meta.appendChild(scoreBadge);
      }

      const statusBadge = document.createElement("span");
      statusBadge.className = `badge ${statusBadgeClass(job.status)}`;
      statusBadge.textContent = job.status || "new";
      meta.appendChild(statusBadge);

      card.appendChild(title);
      card.appendChild(sub);
      card.appendChild(meta);

      if (job.posted_at) {
        const dateEl = document.createElement("div");
        dateEl.className = "dcard-sub";
        dateEl.textContent = `Posted ${formatDate(job.posted_at)}`;
        card.appendChild(dateEl);
      }

      const actions = document.createElement("div");
      actions.className = "dcard-actions";

      const matchedLink = postingLink(job.source_url);
      if (matchedLink) actions.appendChild(matchedLink);

      const applyBtn = document.createElement("button");
      applyBtn.className = "primary";
      applyBtn.type = "button";
      applyBtn.textContent = "Queue apply";
      applyBtn.addEventListener("click", async () => {
        applyBtn.disabled = true;
        applyBtn.textContent = "Queuing...";
        try {
          await apiAuth(`/applications/${job.id}`, { method: "POST" });
          applyBtn.textContent = "Queued ✓";
        } catch (err) {
          applyBtn.disabled = false;
          applyBtn.textContent = "Queue apply";
          setError(matchedError, err);
        }
      });
      actions.appendChild(applyBtn);

      card.appendChild(actions);
      matchedList.appendChild(card);
    }
  } catch (err) {
    setError(matchedError, err, loadMatchedJobs);
  }
}

matchedRefresh.addEventListener("click", () => {
  matchedPage = 1;
  loadMatchedJobs();
});
matchedStatus.addEventListener("change", () => {
  matchedPage = 1;
  loadMatchedJobs();
});
matchedMinScore.addEventListener("change", () => {
  matchedPage = 1;
  loadMatchedJobs();
});
matchedPrev.addEventListener("click", () => {
  if (matchedPage > 1) {
    matchedPage -= 1;
    loadMatchedJobs();
  }
});
matchedNext.addEventListener("click", () => {
  matchedPage += 1;
  loadMatchedJobs();
});

// ============================================================
// APPLICATIONS
// ============================================================
const appsList = document.getElementById("appsList");
const appsEmpty = document.getElementById("appsEmpty");
const appsError = document.getElementById("appsError");
const appStatusChips = document.getElementById("appStatusChips");
const appsRefresh = document.getElementById("appsRefresh");

let activeAppStatus = "";

function appStatusClass(status) {
  const known = ["applied", "interview", "offer", "rejected", "wishlist"];
  const key = (status || "applied").toLowerCase();
  return known.includes(key) ? `badge-${key}` : "badge-applied";
}

const STATUS_OPTIONS = ["Applied", "Interview", "Offer", "Rejected", "Wishlist"];

async function loadApplications() {
  appsError.textContent = "";
  appsList.innerHTML = "";
  appsEmpty.classList.add("hidden");
  skeleton(appsList, 4);

  try {
    // Applications tracked from this dashboard (manual adds + jobs saved
    // from the Email tab's "Save as job") live in /api/jobs, not
    // /api/applications (that one belongs to the separate matched-jobs
    // pipeline, so it stays empty for anything added here or via Gmail).
    const allJobs = await apiAuth("/jobs");
    clearSkeletons();
    const apps = activeAppStatus
      ? allJobs.filter((j) => (j.status || "Applied") === activeAppStatus)
      : allJobs;

    if (apps.length === 0) {
      appsEmpty.classList.remove("hidden");
      return;
    }

    for (const job of apps) {
      const card = document.createElement("div");
      card.className = "dcard";

      const title = document.createElement("div");
      title.className = "dcard-title";
      title.textContent = job.role || "Untitled role";

      const sub = document.createElement("div");
      sub.className = "dcard-sub";
      sub.textContent = job.company || "";

      const meta = document.createElement("div");
      meta.className = "dcard-meta";
      const statusBadge = document.createElement("span");
      statusBadge.className = `badge ${appStatusClass(job.status)}`;
      statusBadge.textContent = job.status || "Applied";
      meta.appendChild(statusBadge);

      card.appendChild(title);
      card.appendChild(sub);
      card.appendChild(meta);

      if (job.applicationDate) {
        const dateEl = document.createElement("div");
        dateEl.className = "dcard-sub";
        dateEl.textContent = `Applied ${formatDate(job.applicationDate)}`;
        card.appendChild(dateEl);
      }

      if (job.notes) {
        const notesEl = document.createElement("div");
        notesEl.className = "dcard-sub";
        notesEl.textContent = job.notes;
        card.appendChild(notesEl);
      }

      const actions = document.createElement("div");
      actions.className = "dcard-actions";

      // The direct link to the original posting, saved with the job.
      const savedLink = postingLink(job.sourceUrl);
      if (savedLink) actions.appendChild(savedLink);

      const statusSelect = document.createElement("select");
      for (const opt of STATUS_OPTIONS) {
        const optionEl = document.createElement("option");
        optionEl.value = opt;
        optionEl.textContent = opt;
        if ((job.status || "Applied") === opt) optionEl.selected = true;
        statusSelect.appendChild(optionEl);
      }
      statusSelect.addEventListener("change", async () => {
        statusSelect.disabled = true;
        try {
          await apiAuth(`/jobs/${job.id}`, {
            method: "PUT",
            body: JSON.stringify({ status: statusSelect.value }),
          });
          loadApplications();
        } catch (err) {
          statusSelect.disabled = false;
          setError(appsError, err);
        }
      });
      actions.appendChild(statusSelect);

      card.appendChild(actions);
      appsList.appendChild(card);
    }
  } catch (err) {
    setError(appsError, err, loadApplications);
  }
}

appStatusChips.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  for (const c of appStatusChips.querySelectorAll(".chip")) c.classList.remove("active");
  chip.classList.add("active");
  activeAppStatus = chip.dataset.status;
  loadApplications();
});

appsRefresh.addEventListener("click", loadApplications);

// ============================================================
// ANALYTICS
// ============================================================
const analyticsSummary = document.getElementById("analyticsSummary");
const analyticsConversion = document.getElementById("analyticsConversion");
const analyticsFunnel = document.getElementById("analyticsFunnel");
const analyticsError = document.getElementById("analyticsError");
const analyticsRange = document.getElementById("analyticsRange");
const analyticsRefresh = document.getElementById("analyticsRefresh");

function statCard(num, label) {
  const el = document.createElement("div");
  el.className = "statCard";
  el.append(cell("div", "num", String(num ?? "—")), cell("div", "label", label));
  return el;
}

async function loadAnalytics() {
  analyticsError.textContent = "";
  analyticsSummary.innerHTML = "";
  analyticsConversion.innerHTML = "";
  analyticsFunnel.innerHTML = "";
  skeleton(analyticsSummary, 5);

  try {
    const [summaryRes, funnelRes] = await Promise.all([
      apiAuth(`/analytics?range=${analyticsRange.value}`),
      apiAuth(`/analytics/funnel`),
    ]);

    clearSkeletons();
    const d = summaryRes.data || {};
    analyticsSummary.appendChild(statCard(d.totalApplications, "Total applications"));
    analyticsSummary.appendChild(statCard(d.responseRatePct != null ? `${d.responseRatePct}%` : "—", "Response rate"));
    analyticsSummary.appendChild(statCard(d.averageResponseTimeHours != null ? `${d.averageResponseTimeHours}h` : "—", "Avg. response time"));
    analyticsSummary.appendChild(statCard(d.counts?.interviews, "Interviews"));
    analyticsSummary.appendChild(statCard(d.counts?.offers, "Offers"));

    const c = d.conversionRate || {};
    analyticsConversion.appendChild(statCard(c.appliedToInterviewPct != null ? `${c.appliedToInterviewPct}%` : "—", "Applied → interview"));
    analyticsConversion.appendChild(statCard(c.interviewToOfferPct != null ? `${c.interviewToOfferPct}%` : "—", "Interview → offer"));
    analyticsConversion.appendChild(statCard(c.appliedToOfferPct != null ? `${c.appliedToOfferPct}%` : "—", "Applied → offer"));

    const funnel = funnelRes.data || {};
    const stages = [
      ["Matched", funnel.matched],
      ["Applied", funnel.applied],
      ["Interview", funnel.interview],
      ["Offer", funnel.offer],
    ];
    const maxVal = Math.max(1, ...stages.map(([, v]) => Number(v) || 0));

    for (const [label, val] of stages) {
      const row = document.createElement("div");
      row.className = "funnelRow";
      const pct = Math.round(((Number(val) || 0) / maxVal) * 100);
      const track = cell("div", "funnelBarTrack", "");
      const fill = cell("div", "funnelBarFill", "");
      fill.style.width = `${pct}%`;
      track.append(fill);
      row.append(cell("div", "funnelLabel", label), track, cell("div", "funnelVal", String(val ?? 0)));
      analyticsFunnel.appendChild(row);
    }
  } catch (err) {
    setError(analyticsError, err, loadAnalytics);
  }
}

analyticsRefresh.addEventListener("click", loadAnalytics);
analyticsRange.addEventListener("change", loadAnalytics);

// ============================================================
// COMPANIES  (prisma `companies` table)
// ============================================================
const companiesBody = document.getElementById("companiesBody");
const companiesEmpty = document.getElementById("companiesEmpty");
const companiesError = document.getElementById("companiesError");
const companiesSearch = document.getElementById("companiesSearch");
const companiesRefresh = document.getElementById("companiesRefresh");

let companiesDebounce;

async function loadCompanies() {
  companiesError.textContent = "";
  companiesBody.innerHTML = "";
  companiesEmpty.classList.add("hidden");
  skeleton(companiesBody, 4, "tr");

  try {
    const params = new URLSearchParams({ pageSize: "50" });
    if (companiesSearch.value.trim()) params.set("search", companiesSearch.value.trim());

    const result = await apiAuth(`/companies?${params.toString()}`);
    clearSkeletons();
    const companies = result.data || [];

    if (companies.length === 0) {
      companiesEmpty.classList.remove("hidden");
      return;
    }

    for (const c of companies) {
      const row = document.createElement("tr");
      const count = cell("td", "num", "");
      count.append(cell("span", "pill", String(c.jobCount ?? 0)));
      row.append(cell("td", "cellStrong", c.name || "—"), cell("td", "cellMuted", c.domain || "—"), count);
      companiesBody.appendChild(row);
    }
  } catch (err) {
    setError(companiesError, err, loadCompanies);
  }
}

companiesRefresh.addEventListener("click", loadCompanies);
companiesSearch.addEventListener("input", () => {
  clearTimeout(companiesDebounce);
  companiesDebounce = setTimeout(loadCompanies, 300);
});

// ============================================================
// SOURCES  (prisma `job_sources` table)
// ============================================================
const sourcesList = document.getElementById("sourcesList");
const sourcesEmpty = document.getElementById("sourcesEmpty");
const sourcesError = document.getElementById("sourcesError");
const sourcesRefresh = document.getElementById("sourcesRefresh");

async function loadSources() {
  sourcesError.textContent = "";
  sourcesList.innerHTML = "";
  sourcesEmpty.classList.add("hidden");
  skeleton(sourcesList, 3);

  try {
    const result = await apiAuth("/sources");
    clearSkeletons();
    const sources = result.data || [];

    if (sources.length === 0) {
      sourcesEmpty.classList.remove("hidden");
      return;
    }

    const maxJobs = Math.max(1, ...sources.map((s) => s.jobCount || 0));

    for (const s of sources) {
      const pct = Math.round(((s.jobCount || 0) / maxJobs) * 100);
      const row = document.createElement("div");
      row.className = "sourceRow";
      const head = cell("div", "sourceHead", "");
      const info = cell("div", "", "");
      info.append(cell("div", "sourceName", s.name || "Unnamed source"));
      // only http(s) links — a scraped value like javascript:… must never become a clickable href
      if (/^https?:\/\//i.test(s.baseUrl || "")) {
        const link = cell("a", "sourceLink", s.baseUrl);
        link.href = s.baseUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        info.append(link);
      }
      head.append(info, cell("span", "pill", `${s.jobCount ?? 0} jobs`));
      const track = cell("div", "funnelBarTrack", "");
      const fill = cell("div", "funnelBarFill", "");
      fill.style.width = `${pct}%`;
      track.append(fill);
      row.append(head, track);
      sourcesList.appendChild(row);
    }
  } catch (err) {
    setError(sourcesError, err, loadSources);
  }
}

sourcesRefresh.addEventListener("click", loadSources);

// ============================================================
// PROFILE
// ============================================================
const profileForm = document.getElementById("profileForm");
const profFullName = document.getElementById("profFullName");
const profEmail = document.getElementById("profEmail");
const profExperience = document.getElementById("profExperience");
const profSkills = document.getElementById("profSkills");
const profResume = document.getElementById("profResume");
const profMsg = document.getElementById("profMsg");
const profSaveBtn = document.getElementById("profSaveBtn");

let profileLoaded = false;

async function loadProfile() {
  if (profileLoaded) return;
  profMsg.textContent = "";
  try {
    const result = await apiAuth("/profile");
    const p = result.data;
    if (p) {
      profFullName.value = p.full_name || "";
      profEmail.value = p.email || "";
      profExperience.value = p.experience_years ?? "";
      profSkills.value = (p.skills || []).join(", ");
      profResume.value = p.resume_text || "";
    }
    profileLoaded = true;
  } catch (err) {
    setError(profMsg, err, () => { profileLoaded = false; loadProfile(); });
  }
}

profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  profSaveBtn.disabled = true;
  profMsg.textContent = "";

  const payload = {
    fullName: profFullName.value.trim(),
    email: profEmail.value.trim(),
    resumeText: profResume.value.trim(),
    skills: profSkills.value.split(",").map((s) => s.trim()).filter(Boolean),
    experienceYears: profExperience.value ? Number(profExperience.value) : null,
  };

  try {
    await apiAuth("/profile", { method: "POST", body: JSON.stringify(payload) });
    profMsg.className = "success";
    profMsg.textContent = "Profile saved.";
  } catch (err) {
    setError(profMsg, err);
  } finally {
    profSaveBtn.disabled = false;
  }
});

// ============================================================
// EMAIL (GMAIL)
// ============================================================
const gmailStatusBadge = document.getElementById("gmailStatusBadge");
const gmailConnectBtn = document.getElementById("gmailConnectBtn");
const gmailDisconnectBtn = document.getElementById("gmailDisconnectBtn");
const gmailRefreshStatusBtn = document.getElementById("gmailRefreshStatusBtn");
const gmailScanBtn = document.getElementById("gmailScanBtn");
const emailList = document.getElementById("emailList");
const emailEmpty = document.getElementById("emailEmpty");
const emailError = document.getElementById("emailError");

async function loadGmailStatus() {
  emailError.textContent = "";

  // Loading state
  gmailStatusBadge.textContent = "Checking...";
  gmailStatusBadge.className = "badge badge-new";

  gmailConnectBtn.textContent = "Checking...";
  gmailConnectBtn.disabled = true;
  gmailConnectBtn.classList.remove("is-connected");

  gmailDisconnectBtn.disabled = true;

  try {
    const result = await apiAuth("/gmail/status");

    if (result.connected) {
      // Connected state
      gmailStatusBadge.textContent = "Connected";
      gmailStatusBadge.className = "badge badge-connected";

      gmailConnectBtn.textContent = "Gmail Connected";
      gmailConnectBtn.disabled = true;
      gmailConnectBtn.classList.add("is-connected");

      gmailDisconnectBtn.disabled = false;
    } else {
      // Not connected state
      gmailStatusBadge.textContent = "Not connected";
      gmailStatusBadge.className = "badge badge-disconnected";

      gmailConnectBtn.textContent = "Connect Gmail";
      gmailConnectBtn.disabled = false;
      gmailConnectBtn.classList.remove("is-connected");

      gmailDisconnectBtn.disabled = true;
    }
  } catch (err) {
    gmailStatusBadge.textContent = "Unknown";

    gmailConnectBtn.textContent = "Connect Gmail";
    gmailConnectBtn.disabled = false;
    gmailConnectBtn.classList.remove("is-connected");

    gmailDisconnectBtn.disabled = true;

    setError(emailError, err, loadGmailStatus);
  }
}

// Gmail OAuth navigates THIS extension tab to Google. The server callback
// signals the background worker, which navigates this same tab back to this
// dashboard. The session lives in chrome.storage.session, so tab navigation
// does not log the extension user out.
async function onGmailConnectResult(status) {
  await loadGmailStatus(); // the source of truth, whatever `status` says
  if (status === "no_refresh_token") {
    emailError.textContent = "Google didn't return a fresh permission grant. Remove TrackTrail's access at myaccount.google.com/permissions, then try Connect again.";
  } else if (status === "error" && gmailStatusBadge.textContent !== "Connected") {
    emailError.textContent = "Couldn't connect Gmail. Please try again.";
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "GMAIL_CONNECT_RESULT") onGmailConnectResult(message.status);
});

gmailConnectBtn.addEventListener("click", async () => {
  emailError.textContent = "";
  gmailConnectBtn.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: "GMAIL_CONNECT" });
    if (!result?.ok) {
      throw Object.assign(new Error(result?.error || "Couldn't reach TrackTrail."), { code: result?.code || null, retryAfterSeconds: result?.retryAfterSeconds || null });
    }
  } catch (err) {
    setError(emailError, err);
  } finally {
    await loadGmailStatus();
  }
});

gmailDisconnectBtn.addEventListener("click", async () => {
  emailError.textContent = "";
  gmailDisconnectBtn.disabled = true;

  try {
    await apiAuth("/gmail/disconnect", { method: "POST" });

    emailList.innerHTML = "";
    emailEmpty.classList.add("hidden");

    await loadGmailStatus();
  } catch (err) {
    setError(emailError, err);
    await loadGmailStatus();
  }
});

gmailRefreshStatusBtn.addEventListener("click", loadGmailStatus);

// Common ATS/job-board senders whose display name isn't the actual
// hiring company — for these we fall back to the sender's domain instead.
const GENERIC_SENDER_NAMES = [
  "linkedin", "indeed", "glassdoor", "greenhouse", "lever", "workday",
  "myworkday", "smartrecruiters", "icims", "ashby", "notifications",
  "no-reply", "noreply", "careers", "recruiting", "talent",
];

function titleCase(str) {
  return str
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Best-effort guess of the hiring company from a Gmail "From" header, e.g.
// `"Acme Careers" <no-reply@acme.com>` -> "Acme Careers" (or "Acme" from
// the domain if the display name is a generic ATS/platform name).
function guessCompanyFromEmail(fromHeader) {
  if (!fromHeader) return "";

  const match = fromHeader.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const displayName = (match ? match[1] : "").trim();
  const email = (match ? match[2] : fromHeader).trim();

  const isGeneric =
    !displayName ||
    GENERIC_SENDER_NAMES.some((g) => displayName.toLowerCase().includes(g));

  if (!isGeneric) return displayName;

  const domain = email.split("@")[1] || "";
  const domainRoot = domain
    .replace(/^(mail|careers|jobs|hr|talent|notifications|no-?reply)\./i, "")
    .split(".")[0];

  return domainRoot ? titleCase(domainRoot) : displayName;
}

gmailScanBtn.addEventListener("click", async () => {
  emailError.textContent = "";
  emailList.innerHTML = "";
  emailEmpty.classList.add("hidden");
  gmailScanBtn.disabled = true;
  gmailScanBtn.textContent = "Scanning...";

  try {
    const result = await apiAuth("/gmail/scan");
    const messages = result.messages || [];

    if (messages.length === 0) {
      emailEmpty.classList.remove("hidden");
      return;
    }

    for (const msg of messages) {
      const card = document.createElement("div");
      card.className = "dcard";

      const title = document.createElement("div");
      title.className = "dcard-title";
      title.textContent = msg.subject || "(no subject)";

      const meta = document.createElement("div");
      meta.className = "emailCard-meta";
      meta.textContent = [msg.from, msg.date, msg.contactEmail && `Contact: ${msg.contactEmail}`].filter(Boolean).join(" · ");

      const snippet = document.createElement("div");
      snippet.className = "emailCard-snippet";
      snippet.textContent = msg.snippet || "";

      const importRow = document.createElement("div");
      importRow.className = "emailCard-import";

      const companyInput = document.createElement("input");
      companyInput.type = "text";
      companyInput.placeholder = "Company name to save as...";
      companyInput.value = msg.company || guessCompanyFromEmail(msg.from);

      const importBtn = document.createElement("button");
      importBtn.type = "button";
      importBtn.textContent = "Save as job";
      importBtn.addEventListener("click", async () => {
        const company = companyInput.value.trim();
        if (!company) {
          companyInput.focus();
          return;
        }
        importBtn.disabled = true;
        importBtn.textContent = "Saving...";
        try {
          await apiAuth("/gmail/import", {
            method: "POST",
            body: JSON.stringify({
              company,
              role: msg.role || msg.subject || "Untitled role",
              status: msg.status || "Applied",
              contactEmail: msg.contactEmail || null,
              notes: msg.snippet || "",
              // Lets the backend attribute this row to the source email
              // (externalJobId) — never enough alone to bridge into the
              // engine (no description/URL from a metadata-only Gmail
              // scan), but useful for de-duplicating repeat imports.
              messageId: msg.id || null,
            }),
          });
          importBtn.textContent = "Saved ✓";
        } catch (err) {
          importBtn.disabled = false;
          importBtn.textContent = "Save as job";
          setError(emailError, err);
        }
      });

      importRow.appendChild(companyInput);
      importRow.appendChild(importBtn);

      card.appendChild(title);
      card.appendChild(meta);
      if (msg.snippet) card.appendChild(snippet);
      card.appendChild(importRow);
      emailList.appendChild(card);
    }
  } catch (err) {
    setError(emailError, err);
  } finally {
    gmailScanBtn.disabled = false;
    gmailScanBtn.textContent = "Scan inbox";
  }
});

// ---------- init ----------
(async () => {
  loadMatchedJobs();
  openTabFromHash();
})();

// window.TrackTrailTheme comes from theme.js, loaded as a plain script
// ahead of this module script in dashboard.html.
window.TrackTrailTheme.wireThemeToggle("themeToggleBtn");

// ============================================================
// MY RESUMES — backend is the source of truth (/api/resume/*)
// ============================================================
const resumeApi = createResumeApi({
  chromeApi: chrome,
  defaultApiBaseUrl: DEFAULT_API_BASE_URL,
  // the ONE session-refresh flow lives in background.js
  refreshSession: () => chrome.runtime.sendMessage({ type: "REFRESH_SESSION" }),
});

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const resumeManager = createResumeManager({
  doc: document,
  formatDate,
  saveBlob,
  confirmFn: confirmDialog,
  openWeb: async (path) => {
    const { webAppUrl } = await chrome.storage.local.get("webAppUrl");
    window.open(`${(webAppUrl || DEFAULT_WEB_APP_URL).replace(/\/+$/, "")}${path}`, "_blank", "noopener");
  },
  api: resumeApi,
});
