// Access tokens intentionally live only in memory. The durable credential is
// the HttpOnly refresh cookie issued by the API, so XSS cannot read a session
// credential from localStorage/sessionStorage.
let accessToken = null;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token) => {
  accessToken = typeof token === "string" && token ? token : null;
};
export const clearAccessToken = () => {
  accessToken = null;
};

// Browser-side cache that belongs to a signed-in user's data. App keys are namespaced
// "tracktrail:" / "tracktrail-"; the theme is a device preference and is kept.
const THEME_KEY = "tracktrail-theme";

export function clearLocalUserData() {
  for (const storage of ["localStorage", "sessionStorage"]) {
    try {
      const store = window[storage];
      const keys = [];
      for (let i = 0; i < store.length; i += 1) keys.push(store.key(i));
      keys
        .filter((k) => k && k.startsWith("tracktrail") && k !== THEME_KEY)
        .forEach((k) => store.removeItem(k));
    } catch {
      /* storage unavailable */
    }
  }
}
