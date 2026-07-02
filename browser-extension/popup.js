import { DEFAULT_API_BASE_URL } from "./config.js";

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
const apiBaseUrlInput = document.getElementById("apiBaseUrl");
const saveApiUrlBtn = document.getElementById("saveApiUrlBtn");
const apiUrlSaved = document.getElementById("apiUrlSaved");

async function render() {
  const session = await sendMessage({ type: "GET_SESSION" });

  if (session.ok && session.loggedIn) {
    loggedOutView.classList.add("hidden");
    loggedInView.classList.remove("hidden");
    userName.textContent = session.user?.name || session.user?.email || "";
  } else {
    loggedOutView.classList.remove("hidden");
    loggedInView.classList.add("hidden");
  }

  const { ok, apiBaseUrl } = await sendMessage({ type: "GET_API_BASE_URL" });
  apiBaseUrlInput.value = ok ? apiBaseUrl.replace(/\/api$/, "") : DEFAULT_API_BASE_URL.replace(/\/api$/, "");
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

saveApiUrlBtn.addEventListener("click", async () => {
  const raw = apiBaseUrlInput.value.trim().replace(/\/+$/, "");
  const apiBaseUrl = raw.endsWith("/api") ? raw : `${raw}/api`;

  await sendMessage({ type: "SET_API_BASE_URL", apiBaseUrl });
  apiUrlSaved.textContent = "Saved!";
  setTimeout(() => (apiUrlSaved.textContent = ""), 2000);
});

render();
