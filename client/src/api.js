import axios from "axios";
import { clearAccessToken, getAccessToken, setAccessToken } from "./utils/auth";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "");
if (import.meta.env.PROD && (!configuredBaseUrl || !/^https:\/\//.test(configuredBaseUrl))) {
  throw new Error("VITE_API_BASE_URL must be an HTTPS URL in production.");
}
const baseUrl = configuredBaseUrl || "http://localhost:5000";
// Vitest's real API harness intentionally has no cookie jar; production and
// development browsers always send credentials for the HttpOnly refresh cookie.
const api = axios.create({ baseURL: `${baseUrl}/api`, withCredentials: !import.meta.env.VITEST, timeout: 20_000 });
let refreshPromise = null;
const canRetry = (config) => ["get", "head", "options"].includes((config.method || "get").toLowerCase());
async function refreshAccessToken() {
  if (!refreshPromise) refreshPromise = api.post("/auth/refresh", undefined, { headers: { "x-client": "web" }, _skipAuthRefresh: true }).then(({ data }) => { setAccessToken(data.accessToken || data.token); return data; }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.token = token;
  config.headers["x-client"] = config.headers["x-client"] || "web";
  return config;
});
api.interceptors.response.use((response) => response, async (error) => {
  const { response, config } = error;
  if (!response) { error.userMessage = navigator.onLine === false ? "You appear to be offline. Check your connection and try again." : "Network error. Please try again."; return Promise.reject(error); }
  if (response.status === 429) error.userMessage = "Too many requests. Please wait a moment and try again.";
  else if (response.status >= 500) error.userMessage = "The service is temporarily unavailable. Please try again.";
  else if (response.status === 403) error.userMessage = "You do not have permission to do that.";
  if (response.status !== 401 || config?._skipAuthRefresh || config?._retried) {
    if (response.status === 401 && !config?._skipAuthRefresh) { clearAccessToken(); window.dispatchEvent(new Event("tracktrail:session-ended")); }
    return Promise.reject(error);
  }
  try { await refreshAccessToken(); if (!canRetry(config)) { error.userMessage = "Your session was restored. Please submit the form again."; return Promise.reject(error); } config._retried = true; return api(config); }
  catch (refreshError) { clearAccessToken(); window.dispatchEvent(new Event("tracktrail:session-ended")); return Promise.reject(refreshError); }
});
export { refreshAccessToken };
export default api;
