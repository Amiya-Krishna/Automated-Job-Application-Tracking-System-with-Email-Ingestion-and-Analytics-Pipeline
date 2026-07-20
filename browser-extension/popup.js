function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, resolve);
  });
}

const loggedOutView = document.getElementById("loggedOutView");
const loggedInView = document.getElementById("loggedInView");
const loginForm = document.getElementById("loginForm");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const userName = document.getElementById("userName");
const logoutBtn = document.getElementById("logoutBtn");
const jobsList = document.getElementById("jobsList");
const jobsEmpty = document.getElementById("jobsEmpty");
const jobsError = document.getElementById("jobsError");
const refreshJobsBtn = document.getElementById("refreshJobsBtn");

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function renderJobs(jobs) {
  jobsList.innerHTML = "";
  jobsError.textContent = "";

  if (!jobs || jobs.length === 0) {
    jobsEmpty.classList.remove("hidden");
    return;
  }

  jobsEmpty.classList.add("hidden");

  for (const job of jobs) {
    const li = document.createElement("li");
    li.className = "jobItem";

    const main = document.createElement("div");
    main.className = "jobItem-main";

    const role = document.createElement("div");
    role.className = "jobItem-role";
    role.textContent = job.role || "Untitled role";

    const company = document.createElement("div");
    company.className = "jobItem-company";
    company.textContent = job.company || "Unknown company";

    main.appendChild(role);
    main.appendChild(company);

    const meta = document.createElement("div");
    meta.className = "jobItem-meta";

    const status = document.createElement("span");
    status.className = "jobItem-status";
    status.textContent = job.status || "Applied";
    meta.appendChild(status);

    const date = formatDate(job.createdAt);
    if (date) {
      const dateEl = document.createElement("span");
      dateEl.className = "jobItem-date";
      dateEl.textContent = date;
      meta.appendChild(dateEl);
    }

    li.appendChild(main);
    li.appendChild(meta);
    jobsList.appendChild(li);
  }
}

async function loadJobs() {
  jobsError.textContent = "";
  const result = await sendMessage({ type: "GET_JOBS" });

  if (result?.ok) {
    renderJobs(result.jobs);
  } else {
    jobsList.innerHTML = "";
    jobsEmpty.classList.add("hidden");
    jobsError.textContent = result?.error || "Couldn't load your saved jobs.";
  }
}

async function render() {
  const session = await sendMessage({ type: "GET_SESSION" });

  if (session.ok && session.loggedIn) {
    loggedOutView.classList.add("hidden");
    loggedInView.classList.remove("hidden");
    userName.textContent = session.user?.name || session.user?.email || "";
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

refreshJobsBtn.addEventListener("click", () => {
  loadJobs();
});

render();
