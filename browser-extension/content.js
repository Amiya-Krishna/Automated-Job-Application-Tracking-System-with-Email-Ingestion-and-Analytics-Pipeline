// Runs on LinkedIn job pages and Indeed job pages. Tries a handful of
// selectors (sites restyle their DOM often, so these are best-effort with
// fallbacks to <title>/meta tags), then injects a floating "Save to
// TrackTrail" button that posts the detected job straight to the backend
// via the background service worker.

function text(el) {
  return el ? el.textContent.trim().replace(/\s+/g, " ") : "";
}

function detectLinkedIn() {
  const titleSelectors = [
    "h1.job-details-jobs-unified-top-card__job-title",
    "h1.top-card-layout__title",
    "h1",
  ];
  const companySelectors = [
    ".job-details-jobs-unified-top-card__company-name a",
    ".job-details-jobs-unified-top-card__company-name",
    ".top-card-layout__second-subline a",
  ];

  let role = "";
  for (const sel of titleSelectors) {
    role = text(document.querySelector(sel));
    if (role) break;
  }

  let company = "";
  for (const sel of companySelectors) {
    company = text(document.querySelector(sel));
    if (company) break;
  }

  if (!role || !company) {
    // Fallback: LinkedIn <title> is usually "(N) Company hiring Role in Location | LinkedIn"
    const match = document.title.match(/hiring\s+(.+?)\s+in\s+/i);
    if (match && !role) role = match[1];

    const ogSiteName = document.querySelector('meta[property="og:title"]');
    if (ogSiteName && !role) role = ogSiteName.content;
  }

  return { company, role };
}

function detectIndeed() {
  const titleSelectors = [
    '[data-testid="jobsearch-JobInfoHeader-title"]',
    "h1.jobsearch-JobInfoHeader-title",
    "h1",
  ];
  const companySelectors = [
    '[data-testid="inlineHeader-companyName"]',
    ".jobsearch-InlineCompanyRating div",
  ];

  let role = "";
  for (const sel of titleSelectors) {
    role = text(document.querySelector(sel));
    if (role) break;
  }

  let company = "";
  for (const sel of companySelectors) {
    company = text(document.querySelector(sel));
    if (company) break;
  }

  if (!role || !company) {
    // Fallback: Indeed <title> is usually "Role - Company - Location"
    const parts = document.title.split(" - ");
    if (parts.length >= 2) {
      if (!role) role = parts[0].trim();
      if (!company) company = parts[1].trim();
    }
  }

  return { company, role };
}

function detectJob() {
  if (window.location.hostname.includes("linkedin.com")) return detectLinkedIn();
  if (window.location.hostname.includes("indeed.com")) return detectIndeed();
  return { company: "", role: "" };
}

function injectButton() {
  if (document.getElementById("tracktrail-save-btn")) return;

  const { company, role } = detectJob();
  if (!company && !role) return;

  const button = document.createElement("button");
  button.id = "tracktrail-save-btn";
  button.className = "tracktrail-fab";
  button.textContent = "+ Save to TrackTrail";
  document.body.appendChild(button);

  button.addEventListener("click", async () => {
    const { company: liveCompany, role: liveRole } = detectJob();

    button.disabled = true;
    button.textContent = "Saving...";

    chrome.runtime.sendMessage(
      {
        type: "SAVE_JOB",
        job: {
          company: liveCompany || "Unknown company",
          role: liveRole || "Unknown role",
          status: "Applied",
          notes: `Saved from ${window.location.hostname}`,
        },
      },
      (response) => {
        button.disabled = false;

        if (response?.ok) {
          button.textContent = "✓ Saved";
          button.classList.add("tracktrail-fab--success");
          setTimeout(() => {
            button.textContent = "+ Save to TrackTrail";
            button.classList.remove("tracktrail-fab--success");
          }, 2500);
        } else {
          button.textContent = response?.error?.includes("logged in")
            ? "Log in via extension icon"
            : "Failed — try again";
          setTimeout(() => {
            button.textContent = "+ Save to TrackTrail";
          }, 2500);
        }
      }
    );
  });
}

// Job sites are single-page apps — the URL changes without a full reload,
// so re-check periodically for a new posting being viewed.
injectButton();
setInterval(injectButton, 1500);
