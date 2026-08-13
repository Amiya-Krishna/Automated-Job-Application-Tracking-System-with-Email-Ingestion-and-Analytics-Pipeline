import { DEFAULT_API_BASE_URL } from "./config.js";

async function getApiBaseUrl() {
  const { apiBaseUrl } = await chrome.storage.local.get("apiBaseUrl");
  return (apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

async function api(path, options = {}) {
  const base = await getApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

const apiChip = document.getElementById("apiChip");

// ---------- tabs ----------
const dashTabs = document.getElementById("dashTabs");
const dashPanels = document.querySelectorAll(".dashPanel");

dashTabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".dash-tab");
  if (!btn) return;
  for (const t of dashTabs.querySelectorAll(".dash-tab")) t.classList.remove("active");
  btn.classList.add("active");
  const targetId = btn.dataset.tab;
  for (const panel of dashPanels) panel.classList.toggle("hidden", panel.id !== targetId);

  if (targetId === "applicationsTab") loadApplications();
  if (targetId === "analyticsTab") loadAnalytics();
  if (targetId === "profileTab") loadProfile();
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

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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
    const result = await api(`/engine/jobs?${params.toString()}`);
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
          await api(`/applications/${job.id}`, { method: "POST" });
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
  const known = ["pending", "applied", "interview", "offer", "rejected"];
  return known.includes(status) ? `badge-${status}` : "badge-pending";
}

async function loadApplications() {
  appsError.textContent = "";
  appsList.innerHTML = "";
  appsEmpty.classList.add("hidden");

  const params = new URLSearchParams();
  if (activeAppStatus) params.set("status", activeAppStatus);

  try {
    const result = await api(`/applications?${params.toString()}`);
    const apps = result.data || [];

    if (apps.length === 0) {
      appsEmpty.classList.remove("hidden");
      return;
    }

    for (const app of apps) {
      const job = app.jobs || {};
      const card = document.createElement("div");
      card.className = "dcard";

      const title = document.createElement("div");
      title.className = "dcard-title";
      title.textContent = job.title || `Job #${app.job_id}`;

      const sub = document.createElement("div");
      sub.className = "dcard-sub";
      sub.textContent = [job.companies?.name, job.location].filter(Boolean).join(" · ");

      const meta = document.createElement("div");
      meta.className = "dcard-meta";
      const statusBadge = document.createElement("span");
      statusBadge.className = `badge ${appStatusClass(app.status)}`;
      statusBadge.textContent = app.status;
      meta.appendChild(statusBadge);

      card.appendChild(title);
      card.appendChild(sub);
      card.appendChild(meta);

      if (app.applied_at) {
        const dateEl = document.createElement("div");
        dateEl.className = "dcard-sub";
        dateEl.textContent = `Applied ${formatDate(app.applied_at)}`;
        card.appendChild(dateEl);
      }

      if (app.failure_reason) {
        const fail = document.createElement("div");
        fail.className = "dcard-fail";
        fail.textContent = `Failed: ${app.failure_reason} (retries: ${app.retry_count ?? 0})`;
        card.appendChild(fail);
      }

      const actions = document.createElement("div");
      actions.className = "dcard-actions";

      if (app.status === "pending") {
        const submitBtn = document.createElement("button");
        submitBtn.className = "primary";
        submitBtn.type = "button";
        submitBtn.textContent = "Mark as applied";
        submitBtn.addEventListener("click", async () => {
          submitBtn.disabled = true;
          try {
            await api(`/applications/${app.id}/submit`, { method: "POST" });
            loadApplications();
          } catch (err) {
            submitBtn.disabled = false;
            appsError.textContent = err.message;
          }
        });
        actions.appendChild(submitBtn);
      }

      if (app.status === "applied") {
        for (const outcome of ["interview", "offer", "rejected"]) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = outcome[0].toUpperCase() + outcome.slice(1);
          btn.addEventListener("click", async () => {
            btn.disabled = true;
            try {
              await api(`/applications/${app.id}/outcome`, {
                method: "POST",
                body: JSON.stringify({ status: outcome }),
              });
              loadApplications();
            } catch (err) {
              btn.disabled = false;
              appsError.textContent = err.message;
            }
          });
          actions.appendChild(btn);
        }
      }

      if (job.source_url) {
        const link = document.createElement("a");
        link.href = job.source_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "dcard-link";
        link.textContent = "View posting ↗";
        actions.appendChild(link);
      }

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
      api(`/analytics?range=${analyticsRange.value}`),
      api(`/analytics/funnel`),
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
    const result = await api("/profile");
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
    await api("/profile", { method: "POST", body: JSON.stringify(payload) });
    profMsg.className = "success";
    profMsg.textContent = "Profile saved.";
  } catch (err) {
    profMsg.className = "error";
    profMsg.textContent = err.message;
  } finally {
    profSaveBtn.disabled = false;
  }
});

// ---------- init ----------
(async () => {
  apiChip.textContent = await getApiBaseUrl();
  loadMatchedJobs();
})();
