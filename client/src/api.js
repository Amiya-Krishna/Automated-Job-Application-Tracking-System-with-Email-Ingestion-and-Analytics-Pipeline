import axios from "axios";
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "./utils/auth";

const configuredBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "");

// Browser production builds use the same-origin /api proxy.
// In development and Vitest, an explicitly configured
// VITE_API_BASE_URL must be respected so integration tests
// can point the client at their test server.
const useRemoteApi = import.meta.env.VITE_USE_REMOTE_API === "true";

const baseUrl = import.meta.env.PROD
  ? ""
  : configuredBaseUrl ||
    (useRemoteApi ? "http://localhost:5000" : "http://localhost:5000");

const apiBaseURL = baseUrl
  ? baseUrl.endsWith("/api")
    ? baseUrl
    : `${baseUrl}/api`
  : "/api";

const axiosConfig = {
  baseURL: apiBaseURL,
  withCredentials: !import.meta.env.VITEST,
  timeout: 20_000,
};

const api = axios.create(axiosConfig);

/*
  Dedicated client for session refresh.

  This client has no auth interceptors, so a failed refresh
  cannot recursively trigger another refresh attempt.
 */
const refreshApi = axios.create(axiosConfig);

let refreshPromise = null;

export const BLOCKED_CODE = "account_blocked";
const BLOCKED_FALLBACK =
  "Your account has been blocked. Please contact an administrator.";

export const isBlockedError = (error) =>
  error?.response?.status === 403 &&
  error?.response?.data?.code === BLOCKED_CODE;

// A blocked account ends the local session; the AuthContext listens for this event.
function endBlockedSession(error) {
  const message = error?.response?.data?.message || BLOCKED_FALLBACK;
  error.userMessage = message;
  clearAccessToken();
  window.dispatchEvent(
    new CustomEvent("tracktrail:session-ended", {
      detail: { reason: "blocked", message },
    })
  );
}

const canRetry = (config) =>
  ["get", "head", "options"].includes(
    (config.method || "get").toLowerCase()
  );

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = refreshApi
      .post("/auth/refresh", undefined, {
        headers: {
          "x-client": "web",
        },
      })
      .then(({ data }) => {
        const token = data.accessToken || data.token;

        if (!token) {
          throw new Error(
            "Refresh response did not contain an access token."
          );
        }

        setAccessToken(token);
        return data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();

  if (token) {
    config.headers.token = token;
  }

  config.headers["x-client"] = config.headers["x-client"] || "web";

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;

    if (!response) {
      error.userMessage =
        navigator.onLine === false
          ? "You appear to be offline. Check your connection and try again."
          : "Network error. Please try again.";

      return Promise.reject(error);
    }

    // The login page shows its own persistent alert for a blocked sign-in.
    if (isBlockedError(error)) {
      if (/\/auth\/login\/?$/.test(config?.url || "")) {
        error.userMessage =
          response.data?.message || BLOCKED_FALLBACK;
      } else {
        endBlockedSession(error);
      }

      return Promise.reject(error);
    }

    if (response.status === 429) {
      error.userMessage =
        "Too many requests. Please wait a moment and try again.";
    } else if (response.status >= 500) {
      error.userMessage =
        "The service is temporarily unavailable. Please try again.";
    } else if (response.status === 403) {
      error.userMessage =
        "You do not have permission to do that.";
    }

    if (
      response.status !== 401 ||
      config?._skipAuthRefresh ||
      config?._retried
    ) {
      if (response.status === 401 && !config?._skipAuthRefresh) {
        clearAccessToken();

        window.dispatchEvent(
          new Event("tracktrail:session-ended")
        );
      }

      return Promise.reject(error);
    }

    try {
      await refreshAccessToken();

      if (!canRetry(config)) {
        error.userMessage =
          "Your session was restored. Please submit the form again.";

        return Promise.reject(error);
      }

      config._retried = true;

      return api(config);
    } catch (refreshError) {
      const refreshCode = refreshError?.response?.data?.code;

      if (refreshCode === "refresh_in_progress") {
        refreshError.userMessage =
          "Your session is being restored. Please try again.";

        return Promise.reject(refreshError);
      }

      if (isBlockedError(refreshError)) {
        endBlockedSession(refreshError);

        return Promise.reject(refreshError);
      }

      clearAccessToken();

      window.dispatchEvent(
        new Event("tracktrail:session-ended")
      );

      return Promise.reject(refreshError);
    }
  }
);

export { refreshAccessToken };
export default api;