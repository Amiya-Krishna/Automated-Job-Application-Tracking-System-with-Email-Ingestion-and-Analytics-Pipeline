// Shared between popup.html and dashboard.html. Persists via
// chrome.storage.local (not localStorage — MV3 service workers/extension
// pages don't share localStorage the way a website's tabs do, and
// chrome.storage.local is also what the rest of this extension already
// uses for auth/settings, so this stays consistent with that).
//
// Uses the same semantic intent as the client's ThemeContext: explicit
// user choice always wins; absent that, fall back to the OS-level
// prefers-color-scheme on first visit; persist whatever the user picks.

const STORAGE_KEY = "tracktrail_theme"; // "light" | "dark"

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

async function getStoredTheme() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      resolve(result[STORAGE_KEY] || null);
    });
  });
}

async function setStoredTheme(theme) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: theme }, resolve);
  });
}

// Call as early as possible (before the rest of the page renders) to
// avoid a light-mode flash on load.
async function initTheme() {
  const stored = await getStoredTheme();
  const theme = stored || (systemPrefersDark() ? "dark" : "light");
  applyTheme(theme);
  return theme;
}

async function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  await setStoredTheme(next);
  return next;
}

// Wires a standard toggle button (expects an element with id="themeToggleBtn"
// containing a single SVG that gets swapped for sun/moon based on state).
function wireThemeToggle(buttonId = "themeToggleBtn") {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  const sunIcon =
    '<svg viewBox="0 0 24 24" fill="none"><path fill="currentColor" d="M21 12.9A9 9 0 1 1 11.1 3a7.2 7.2 0 0 0 9.9 9.9Z"/></svg>';
  const moonIcon =
    '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.5" stroke="currentColor" stroke-width="1.6"/><path stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M12 2.75v2M12 19.25v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2.75 12h2M19.25 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';

  const render = () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    btn.innerHTML = isDark ? moonIcon : sunIcon;
    btn.title = isDark ? "Switch to light mode" : "Switch to dark mode";
    btn.setAttribute("aria-label", btn.title);
  };

  render();
  btn.addEventListener("click", async () => {
    await toggleTheme();
    render();
  });
}

// Not an ES module export — this file is loaded via a plain <script> tag
// (before other scripts) in both popup.html and dashboard.html, same
// pattern the extension already uses for config.js.
window.TrackTrailTheme = { initTheme, toggleTheme, wireThemeToggle, applyTheme };

// Run immediately, as soon as this script itself loads (blocking, in
// <head>, before the body paints) to avoid a light/dark flash.
//
// This replaces the previous `<script>window.TrackTrailTheme.initTheme()</script>`
// inline block that used to sit right after this file's <script src="theme.js">
// tag in popup.html/dashboard.html. Manifest V3's default CSP is
// `script-src 'self'`, which blocks all inline scripts — including tiny
// one-line ones — so the call has to live here instead, in an external,
// CSP-compliant file. Behavior/timing is unchanged: theme.js is still
// loaded as a plain (non-module, non-deferred) <script> ahead of the
// deferred `type="module"` scripts, so this still runs first.
initTheme();
