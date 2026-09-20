// Runs on LinkedIn job pages and Indeed job pages. Tries a handful of
// selectors (sites restyle their DOM often, so these are best-effort with
// fallbacks to <title>/meta tags), then injects a floating "Save to
// TrackTrail" button that posts the detected job straight to the backend
// via the background service worker.
//
// Captures everything legitimately visible on the page — title, company,
// location, description, a canonical source URL, and (where present) the
// site's own job id — so the saved job carries enough metadata to be
// bridged into the matching engine server-side (see engineBridge.js /
// hasEnoughDataToBridge()). Nothing here is invented: any field that
// can't be found on the page is sent as null/empty and the backend
// decides whether that's "enough".

// Detection lives in jd-extract.js (loaded first, see manifest.json) so it can
// be unit-tested. This file only wires the page UI: the original "Save to
// TrackTrail" button plus the new Resume Match panel launcher.
const detectJob = () => TrackTrailExtract.detectJob(document, window.location);

let panel = null;

function injectPanelLauncher() {
  if (document.getElementById("tracktrail-panel-btn")) return;
  const detected = detectJob();
  if (!detected.company && !detected.role) return;

  const launcher = document.createElement("button");
  launcher.id = "tracktrail-panel-btn";
  launcher.className = "tracktrail-fab tracktrail-fab--secondary";
  launcher.textContent = "Resume match";
  document.body.appendChild(launcher);

  launcher.addEventListener("click", () => {
    if (!chrome.runtime?.id) {
      launcher.textContent = "Reload this page";
      return;
    }
    if (!panel) panel = TrackTrailPanel.createPanel({ hostname: window.location.hostname });
    if (panel.isOpen()) panel.close();
    else panel.open();
  });
}

function injectButton() {
  if (document.getElementById("tracktrail-save-btn")) return;

  const detected = detectJob();
  if (!detected.company && !detected.role) return;

  const button = document.createElement("button");
  button.id = "tracktrail-save-btn";
  button.className = "tracktrail-fab";
  button.textContent = "+ Save to TrackTrail";
  document.body.appendChild(button);

  // Match the extension's own light/dark preference (set in the popup/
  // dashboard, persisted to chrome.storage.local) — not the host page's
  // theme, which this button intentionally ignores for contrast reasons
  // (see content.css).
  chrome.storage?.local?.get(["tracktrail_theme"], (result) => {
    if (result.tracktrail_theme === "dark") {
      button.classList.add("tracktrail-fab--dark");
    }
  });

  button.addEventListener("click", async () => {
    if (!chrome.runtime?.id) {
      button.textContent = "Reload this page";
      return;
    }

    // Re-detect at click time (not at inject time) — SPA nav on these
    // sites can change the visible posting without a full page reload.
    const live = detectJob();

    button.disabled = true;
    button.textContent = "Saving...";

    chrome.runtime.sendMessage(
      {
        type: "SAVE_JOB",
        job: TrackTrailExtract.toSaveJob(live, window.location.hostname),
      },
      (response) => {
        button.disabled = false;

        if (response?.ok) {
          button.textContent = response.duplicate ? "Already saved" : "✓ Saved";
          button.classList.add("tracktrail-fab--success");
          setTimeout(() => {
            button.textContent = "+ Save to TrackTrail";
            button.classList.remove("tracktrail-fab--success");
          }, 2500);
        } else {
          button.textContent = response?.error?.includes("logged in")
            ? "Log in via extension icon"
            : "Failed — try again";
          button.classList.add("tracktrail-fab--error");
          setTimeout(() => {
            button.textContent = "+ Save to TrackTrail";
            button.classList.remove("tracktrail-fab--error");
          }, 2500);
        }
      }
    );
  });
}

// Job sites are single-page apps — the URL changes without a full reload,
// so re-check periodically for a new posting being viewed. If the URL
// changes, remove the old button so injectButton() re-evaluates against
// the newly-visible job instead of leaving a stale one in place.
let lastHref = window.location.href;
const pollId = setInterval(() => {
  if (!chrome.runtime?.id) {
    clearInterval(pollId);
    return;
  }
  if (window.location.href !== lastHref) {
    lastHref = window.location.href;
    document.getElementById("tracktrail-save-btn")?.remove();
    document.getElementById("tracktrail-panel-btn")?.remove();
    panel?.reset(); // results for the previous posting no longer apply
  }
  injectButton();
  injectPanelLauncher();
}, 1500);

injectButton();
injectPanelLauncher();
