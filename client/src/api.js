import axios from "axios";

// Reads the deployed backend URL from the environment (set in client/.env
// as VITE_API_BASE_URL). Falls back to localhost for local development.
const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const normalizedBaseUrl = rawBaseUrl.replace(/\/+$/, "");

const api = axios.create({
  baseURL: `${normalizedBaseUrl}/api`,
});

// Attach the auth token to every request automatically instead of
// repeating `{ headers: { token } }` in every single call.
api.interceptors.request.use((config) => {
  const token =
    localStorage.getItem("token") || sessionStorage.getItem("token");

  if (token) {
    config.headers.token = token;
  }

  return config;
});

// If the backend ever responds with 401 (invalid/expired token),
// clear the stale session and bounce to login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      sessionStorage.removeItem("token");

      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default api;