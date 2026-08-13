function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, resolve);
  });
}

// ---------- element refs ----------
const loggedOutView = document.getElementById("loggedOutView");
const loggedInView = document.getElementById("loggedInView");
const loginForm = document.getElementById("loginForm");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const userChip = document.getElementById("userChip");
const logoutBtn = document.getElementById("logoutBtn");

const jobsList = document.getElementById("jobsList");
const jobsEmpty = document.getElementById("jobsEmpty");
const jobsError = document.getElementById("jobsError");
const refreshJobsBtn = document.getElementById("refreshJobsBtn");
const searchInput = document.getElementById("searchInput");
const statusChips = document.getElementById("statusChips");

const addJobForm = document.getElementById("addJobForm");
const addJobBtn = document.getElementById("addJobBtn");
const addJobMsg = document.getElementById("addJobMsg");

const statsGrid = document.getElementById("statsGrid");

const tabs = document.getElementById("tabs");
const tabPanels = document.querySelectorAll(".tabPanel");

const openDashboardBtn = document.getElementById("openDashboardBtn");

const registerForm = document.getElementById("registerForm");
const registerBtn = document.getElementById("registerBtn");
const registerError = document.getElementById("registerError");
const toggleAuthMode = document.getElementById("toggleAuthMode");
const authHint = document.getElementById("authHint");

// ---------- state ----------
let allJobs = [];
let activeStatus = "all";
let searchTerm = "";

// ---------- helpers ----------
function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusClass(status) {
  const known = ["Applied", "Interview", "Offer", "Rejected", "Wishlist"];
  const normalized = (status || "Applied").trim();
  const match = known.find((k) => k.toLowerCase() === normalized.toLowerCase());
  return `status-${match || "Applied"}`;
}

// ---------- tabs ----------
tabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;

  for (const t of tabs.querySelectorAll(".tab")) t.classList.remove("active");
  btn.classList.add("active");

  const targetId = btn.dataset.tab;
  for (const panel of tabPanels) {
    panel.classList.toggle("hidden", panel.id !== targetId);
  }

  if (targetId === "statsTab") renderStats();
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
  } else {
    authMode = "login";
    registerForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
    authHint.textContent = "Sign in to manage your job applications right from your browser.";
    toggleAuthMode.textContent = "Don't have an account? Sign up";
  }
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  registerError.textContent = "";
  registerBtn.disabled = true;
  registerBtn.textContent = "Creating account...";

  const name = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;

  const result = await sendMessage({ type: "REGISTER", name, email, password });

  if (!result.ok) {
    registerBtn.disabled = false;
    registerBtn.textContent = "Create account";
    registerError.textContent = result.error || "Registration failed";
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

function renderJobs() {
  jobsList.innerHTML = "";
  jobsError.textContent = "";

  const filtered = applyFilters();

  if (filtered.length === 0) {
    jobsEmpty.classList.remove("hidden");
    return;
  }
  jobsEmpty.classList.add("hidden");

  const statusOptions = ["Applied", "Interview", "Offer", "Rejected", "Wishlist"];

  for (const job of filtered) {
    const li = document.createElement("li");
    li.className = "jobItem";

    const top = document.createElement("div");
    top.className = "jobItem-top";

    const main = document.createElement("div");
    const role = document.createElement("div");
    role.className = "jobItem-role";
    role.textContent = job.role || "Untitled role";
    const company = document.createElement("div");
    company.className = "jobItem-company";
    company.textContent = job.company || "Unknown company";
    main.appendChild(role);
    main.appendChild(company);

    const badge = document.createElement("span");
    badge.className = `status-badge ${statusClass(job.status)}`;
    badge.textContent = job.status || "Applied";

    top.appendChild(main);
    top.appendChild(badge);
    li.appendChild(top);

    if (job.notes) {
      const notes = document.createElement("div");
      notes.className = "jobItem-notes";
      notes.textContent = job.notes;
      li.appendChild(notes);
    }

    const actions = document.createElement("div");
    actions.className = "jobItem-actions";

    const select = document.createElement("select");
    select.className = "jobItem-status-select";
    for (const opt of statusOptions) {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      if ((job.status || "Applied") === opt) o.selected = true;
      select.appendChild(o);
    }
    select.addEventListener("change", async () => {
      const prevStatus = job.status;
      select.disabled = true;
      const result = await sendMessage({
        type: "UPDATE_JOB",
        id: job.id,
        updates: { status: select.value },
      });
      select.disabled = false;
      if (result?.ok) {
        job.status = select.value;
        badge.textContent = select.value;
        badge.className = `status-badge ${statusClass(select.value)}`;
      } else {
        select.value = prevStatus;
        jobsError.textContent = result?.error || "Couldn't update status.";
      }
    });

    const dateEl = document.createElement("span");
    dateEl.className = "jobItem-date";
    dateEl.textContent = formatDate(job.createdAt);

    const delBtn = document.createElement("button");
    delBtn.className = "delete-btn";
    delBtn.type = "button";
    delBtn.title = "Delete";
    delBtn.textContent = "✕";
    delBtn.addEventListener("click", async () => {
      if (!confirm(`Delete "${job.role || "this job"}" at ${job.company || "this company"}?`)) return;
      delBtn.disabled = true;
      const result = await sendMessage({ type: "DELETE_JOB", id: job.id });
      if (result?.ok) {
        allJobs = allJobs.filter((j) => j.id !== job.id);
        renderJobs();
      } else {
        delBtn.disabled = false;
        jobsError.textContent = result?.error || "Couldn't delete job.";
      }
    });

    actions.appendChild(select);
    actions.appendChild(dateEl);
    actions.appendChild(delBtn);
    li.appendChild(actions);

    jobsList.appendChild(li);
  }
}

async function loadJobs() {
  jobsError.textContent = "";
  const result = await sendMessage({ type: "GET_JOBS" });

  if (result?.ok) {
    allJobs = result.jobs || [];
    renderJobs();
  } else {
    allJobs = [];
    jobsList.innerHTML = "";
    jobsEmpty.classList.add("hidden");
    jobsError.textContent = result?.error || "Couldn't load your saved jobs.";
  }
}

statusChips.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  for (const c of statusChips.querySelectorAll(".chip")) c.classList.remove("active");
  chip.classList.add("active");
  activeStatus = chip.dataset.status;
  renderJobs();
});

searchInput.addEventListener("input", () => {
  searchTerm = searchInput.value.trim().toLowerCase();
  renderJobs();
});

refreshJobsBtn.addEventListener("click", () => {
  loadJobs();
});

// ---------- add job ----------
addJobForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  addJobMsg.className = "error";
  addJobMsg.textContent = "";
  addJobBtn.disabled = true;
  addJobBtn.textContent = "Adding...";

  const job = {
    company: document.getElementById("addCompany").value.trim(),
    role: document.getElementById("addRole").value.trim(),
    status: document.getElementById("addStatus").value,
    interviewDate: document.getElementById("addInterviewDate").value || null,
    notes: document.getElementById("addNotes").value.trim(),
  };

  const result = await sendMessage({ type: "SAVE_JOB", job });

  addJobBtn.disabled = false;
  addJobBtn.textContent = "Add job";

  if (result?.ok) {
    addJobForm.reset();
    addJobMsg.className = "success";
    addJobMsg.textContent = "Job added.";
    setTimeout(() => (addJobMsg.textContent = ""), 1800);
    await loadJobs();
  } else {
    addJobMsg.textContent = result?.error || "Couldn't add job.";
  }
});

// ---------- stats ----------
function renderStats() {
  const counts = { Applied: 0, Interview: 0, Offer: 0, Rejected: 0, Wishlist: 0 };
  const knownKeys = Object.keys(counts);
  for (const job of allJobs) {
    const raw = (job.status || "Applied").trim();
    const match = knownKeys.find((k) => k.toLowerCase() === raw.toLowerCase());
    const key = match || "Applied";
    counts[key] = (counts[key] || 0) + 1;
  }

  statsGrid.innerHTML = "";

  const total = document.createElement("div");
  total.className = "statCard total";
  total.innerHTML = `<div class="num">${allJobs.length}</div><div class="label">Total tracked</div>`;
  statsGrid.appendChild(total);

  for (const [label, num] of Object.entries(counts)) {
    const card = document.createElement("div");
    card.className = "statCard";
    card.innerHTML = `<div class="num">${num}</div><div class="label">${label}</div>`;
    statsGrid.appendChild(card);
  }
}

// ---------- open full dashboard ----------
openDashboardBtn?.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

// ---------- session / login / logout ----------
async function render() {
  const session = await sendMessage({ type: "GET_SESSION" });

  if (session.ok && session.loggedIn) {
    loggedOutView.classList.add("hidden");
    loggedInView.classList.remove("hidden");
    userChip.textContent = session.user?.name || session.user?.email || "";
    userChip.title = session.user?.email || "";
    await loadJobs();
  } else {
    loggedOutView.classList.remove("hidden");
    loggedInView.classList.add("hidden");
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in...";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const result = await sendMessage({ type: "LOGIN", email, password });

  loginBtn.disabled = false;
  loginBtn.textContent = "Log in";

  if (result.ok) {
    render();
  } else {
    loginError.textContent = result.error || "Login failed";
  }
});

logoutBtn.addEventListener("click", async () => {
  await sendMessage({ type: "LOGOUT" });
  render();
});

render();
