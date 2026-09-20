// Default backend URL — this is read on first install. Users can override
// it from the extension popup (stored in chrome.storage.local) without
// editing this file, so one packaged extension works for any deployment.
export const DEFAULT_API_BASE_URL =
  "https://job-application-tracker-portal-o1ls.onrender.com/api";

// Where the TrackTrail web app lives (Resume Tailoring workspace opens here).
// Overridable from chrome.storage.local ("webAppUrl") like the API URL.
export const DEFAULT_WEB_APP_URL =
  "https://job-application-tracker-portal-ten.vercel.app";
