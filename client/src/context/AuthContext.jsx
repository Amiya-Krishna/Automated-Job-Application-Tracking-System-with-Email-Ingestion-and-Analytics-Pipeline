import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { refreshAccessToken } from "../api";
import { clearAccessToken, getAccessToken, setAccessToken } from "../utils/auth";

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);
  const restore = useCallback(async () => {
    setStatus("loading");

    // A web Gmail OAuth flow leaves the SPA in a top-level navigation. The normal
    // access token is memory-only, so consume the short-lived same-tab handoff first.
    // This is intentionally sessionStorage (not localStorage): closing the tab drops
    // it, and the handoff is deleted as soon as it is read.
    try {
      const raw = sessionStorage.getItem("tracktrail:web-oauth-handoff");
      if (raw) {
        sessionStorage.removeItem("tracktrail:web-oauth-handoff");
        const handoff = JSON.parse(raw);
        if (handoff?.token && Number(handoff.expiresAt) > Date.now()) {
          setAccessToken(handoff.token);
        }
      }
    } catch {
      sessionStorage.removeItem("tracktrail:web-oauth-handoff");
    }

    try {
      // Prefer the restored OAuth access token. If there is no handoff, the durable
      // HttpOnly refresh cookie restores an ordinary browser session.
      if (!getAccessToken()) await refreshAccessToken();
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      setStatus("authenticated");
    } catch {
      clearAccessToken();
      setUser(null);
      setStatus("anonymous");
    }
  }, []);
  useEffect(() => { restore(); const ended = () => { clearAccessToken(); setUser(null); setStatus("anonymous"); }; window.addEventListener("tracktrail:session-ended", ended); return () => window.removeEventListener("tracktrail:session-ended", ended); }, [restore]);
  const login = useCallback((data) => { setAccessToken(data.accessToken || data.token); setUser(data.user); setStatus("authenticated"); }, []);
  const logout = useCallback(async () => { try { await api.post("/auth/logout", undefined, { _skipAuthRefresh: true }); } catch { /* local sign-out still succeeds */ } clearAccessToken(); setUser(null); setStatus("anonymous"); }, []);
  const isAdmin = user?.role === "admin";
  const value = useMemo(() => ({ status, user, isAdmin, login, logout, restore }), [status, user, isAdmin, login, logout, restore]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(required = true) {
  const context = useContext(AuthContext);
  if (!context && required) throw new Error("useAuth must be used within AuthProvider");
  return context || { status: "anonymous", user: null, isAdmin: false, logout: async () => clearAccessToken() };
}
