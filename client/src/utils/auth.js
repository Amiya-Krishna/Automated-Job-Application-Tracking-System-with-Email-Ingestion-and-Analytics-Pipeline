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
