export function getStoredToken() {
  return localStorage.getItem("token") || sessionStorage.getItem("token");
}

export function storeToken(token, rememberUser) {
  if (rememberUser) {
    localStorage.setItem("token", token);
    sessionStorage.removeItem("token");
    return;
  }

  sessionStorage.setItem("token", token);
  localStorage.removeItem("token");
}

export function clearStoredToken() {
  localStorage.removeItem("token");
  sessionStorage.removeItem("token");
}
