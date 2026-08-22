import { DEFAULT_API_BASE_URL } from "./config.js";

async function getApiBaseUrl() {
  const { apiBaseUrl } = await chrome.storage.local.get("apiBaseUrl");
  return (apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

async function api(path, options = {}) {
  const base = await getApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

// Gmail routes require the same auth token the popup uses for /api/jobs.
async function apiAuth(path, options = {}) {
  const { token } = await chrome.storage.local.get("token");
  if (!token) {
    throw new Error("Not logged in. Open the extension popup and sign in first.");
  }
  return api(path, {
    ...options,
    headers: { token, ...(options.headers || {}) },
  });
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ---------- sidebar nav ----------
const dashTabs = document.getElementById("dashTabs");
const dashPanels = document.querySelectorAll(".dashPanel");
const pageTitle = document.getElementById("pageTitle");
const pageDesc = document.getElementById("pageDesc");

dashTabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-item");
  if (!btn) return;
  for (const t of dashTabs.querySelectorAll(".nav-item")) t.classList.remove("active");
  btn.classList.add("active");

  const targetId = btn.dataset.tab;
  for (const panel of dashPanels) panel.classList.toggle("hidden", panel.id !== targetId);

  pageTitle.textContent = btn.dataset.title || "";
  pageDesc.textContent = btn.dataset.desc || "";

  if (targetId === "applicationsTab") loadApplications();
  if (targetId === "analyticsTab") loadAnalytics();
  if (targetId === "companiesTab") loadCompanies();
  if (targetId === "sourcesTab") loadSources();
  if (targetId === "profileTab") loadProfile();
  if (targetId === "emailTab") loadGmailStatus();
});

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

  const params = new URLSearchParams();
  if (matchedStatus.value) params.set("status", matchedStatus.value);
  if (matchedMinScore.value) params.set("minScore", matchedMinScore.value);
  params.set("page", matchedPage);
  params.set("pageSize", matchedPageSize);

  try {
    const result = await apiAuth(`/engine/jobs?${params.toString()}`);
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

      if (job.source_url) {
        const link = document.createElement("a");
        link.href = job.source_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "dcard-link";
        link.textContent = "View posting ↗";
        actions.appendChild(link);
      }

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
          matchedError.textContent = err.message;
        }
      });
      actions.appendChild(applyBtn);

      card.appendChild(actions);
      matchedList.appendChild(card);
    }
  } catch (err) {
    matchedError.textContent = err.message;
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

  try {
    // Applications tracked from this dashboard (manual adds + jobs saved
    // from the Email tab's "Save as job") live in /api/jobs, not
    // /api/applications (that one belongs to the separate matched-jobs
    // pipeline, so it stays empty for anything added here or via Gmail).
    const allJobs = await apiAuth("/jobs");
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
          appsError.textContent = err.message;
        }
      });
      actions.appendChild(statusSelect);

      card.appendChild(actions);
      appsList.appendChild(card);
    }
  } catch (err) {
    appsError.textContent = err.message;
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
  el.innerHTML = `<div class="num">${num ?? "—"}</div><div class="label">${label}</div>`;
  return el;
}

async function loadAnalytics() {
  analyticsError.textContent = "";
  analyticsSummary.innerHTML = "";
  analyticsConversion.innerHTML = "";
  analyticsFunnel.innerHTML = "";

  try {
    const [summaryRes, funnelRes] = await Promise.all([
      apiAuth(`/analytics?range=${analyticsRange.value}`),
      apiAuth(`/analytics/funnel`),
    ]);

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
      ["Scraped", funnel.scraped],
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
      row.innerHTML = `
        <div class="funnelLabel">${label}</div>
        <div class="funnelBarTrack"><div class="funnelBarFill" style="width:${pct}%"></div></div>
        <div class="funnelVal">${val ?? 0}</div>
      `;
      analyticsFunnel.appendChild(row);
    }
  } catch (err) {
    analyticsError.textContent = err.message;
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

  try {
    const params = new URLSearchParams({ pageSize: "50" });
    if (companiesSearch.value.trim()) params.set("search", companiesSearch.value.trim());

    const result = await apiAuth(`/companies?${params.toString()}`);
    const companies = result.data || [];

    if (companies.length === 0) {
      companiesEmpty.classList.remove("hidden");
      return;
    }

    for (const c of companies) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td class="cellStrong">${c.name}</td>
        <td class="cellMuted">${c.domain || "—"}</td>
        <td class="num"><span class="pill">${c.jobCount}</span></td>
      `;
      companiesBody.appendChild(row);
    }
  } catch (err) {
    companiesError.textContent = err.message;
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

  try {
    const result = await apiAuth("/sources");
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
      row.innerHTML = `
        <div class="sourceHead">
          <div>
            <div class="sourceName">${s.name}</div>
            ${s.baseUrl ? `<a class="sourceLink" href="${s.baseUrl}" target="_blank" rel="noopener noreferrer">${s.baseUrl}</a>` : ""}
          </div>
          <span class="pill">${s.jobCount} jobs</span>
        </div>
        <div class="funnelBarTrack"><div class="funnelBarFill" style="width:${pct}%"></div></div>
      `;
      sourcesList.appendChild(row);
    }
  } catch (err) {
    sourcesError.textContent = err.message;
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
    profMsg.className = "error";
    profMsg.textContent = err.message;
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
    profMsg.className = "error";
    profMsg.textContent = err.message;
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
  gmailStatusBadge.textContent = "Checking...";
  gmailStatusBadge.className = "badge badge-new";
  gmailConnectBtn.classList.add("hidden");
  gmailDisconnectBtn.classList.add("hidden");

  try {
    const result = await apiAuth("/gmail/status");
    if (result.connected) {
      gmailStatusBadge.textContent = "Connected";
      gmailStatusBadge.className = "badge badge-connected";
      gmailDisconnectBtn.classList.remove("hidden");
    } else {
      gmailStatusBadge.textContent = "Not connected";
      gmailStatusBadge.className = "badge badge-disconnected";
      gmailConnectBtn.classList.remove("hidden");
    }
  } catch (err) {
    gmailStatusBadge.textContent = "Unknown";
    emailError.textContent = err.message;
  }
}

gmailConnectBtn.addEventListener("click", async () => {
  emailError.textContent = "";
  gmailConnectBtn.disabled = true;
  try {
    const result = await apiAuth("/gmail/auth-url?source=extension");
    chrome.tabs.create({ url: result.url });
  } catch (err) {
    emailError.textContent = err.message;
  } finally {
    gmailConnectBtn.disabled = false;
  }
});

gmailDisconnectBtn.addEventListener("click", async () => {
  emailError.textContent = "";
  gmailDisconnectBtn.disabled = true;
  try {
    await apiAuth("/gmail/disconnect", { method: "POST" });
    await loadGmailStatus();
    emailList.innerHTML = "";
    emailEmpty.classList.add("hidden");
  } catch (err) {
    emailError.textContent = err.message;
  } finally {
    gmailDisconnectBtn.disabled = false;
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
      meta.textContent = [msg.from, msg.date].filter(Boolean).join(" · ");

      const snippet = document.createElement("div");
      snippet.className = "emailCard-snippet";
      snippet.textContent = msg.snippet || "";

      const importRow = document.createElement("div");
      importRow.className = "emailCard-import";

      const companyInput = document.createElement("input");
      companyInput.type = "text";
      companyInput.placeholder = "Company name to save as...";
      companyInput.value = guessCompanyFromEmail(msg.from);

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
              role: msg.subject || "Untitled role",
              status: "Applied",
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
          emailError.textContent = err.message;
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
    emailError.textContent = err.message;
  } finally {
    gmailScanBtn.disabled = false;
    gmailScanBtn.textContent = "Scan inbox";
  }
});

// ---------- init ----------
(async () => {
  loadMatchedJobs();
})();

// window.TrackTrailTheme comes from theme.js, loaded as a plain script
// ahead of this module script in dashboard.html.
window.TrackTrailTheme.wireThemeToggle("themeToggleBtn");
