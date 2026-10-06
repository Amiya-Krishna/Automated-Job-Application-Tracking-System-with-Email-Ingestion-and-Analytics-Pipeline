import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { isBlockedError, refreshAccessToken } from "../api";
import { clearAccessToken, clearLocalUserData, getAccessToken, setAccessToken } from "../utils/auth";

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);
  const [sessionNotice, setSessionNotice] = useState(null);
  const clearSessionNotice = useCallback(() => setSessionNotice(null), []);
  // Ends the local session without calling the API (e.g. blocked or deleted account).
  const endSession = useCallback((notice) => {
    clearAccessToken();
    clearLocalUserData();
    setUser(null);
    setStatus("anonymous");
    setSessionNotice(notice || null);
  }, []);
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
    } catch (error) {
      clearAccessToken();
      setUser(null);
      setStatus("anonymous");
      if (isBlockedError(error)) {
        setSessionNotice({ kind: "blocked", message: error.userMessage || error.response?.data?.message });
      }
    }
  }, []);
  useEffect(() => { restore(); const ended = (event) => { clearAccessToken(); setUser(null); setStatus("anonymous"); const d = event?.detail; if (d?.reason === "blocked") setSessionNotice({ kind: "blocked", message: d.message }); }; window.addEventListener("tracktrail:session-ended", ended); return () => window.removeEventListener("tracktrail:session-ended", ended); }, [restore]);
  const login = useCallback((data) => { setAccessToken(data.accessToken || data.token); setUser(data.user); setStatus("authenticated"); setSessionNotice(null); }, []);
  const logout = useCallback(async () => { try { await api.post("/auth/logout", undefined, { _skipAuthRefresh: true }); } catch { /* local sign-out still succeeds */ } clearAccessToken(); setUser(null); setStatus("anonymous"); }, []);
  const isAdmin = user?.role === "admin";
  const value = useMemo(() => ({ status, user, isAdmin, login, logout, restore, endSession, sessionNotice, clearSessionNotice }), [status, user, isAdmin, login, logout, restore, endSession, sessionNotice, clearSessionNotice]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(required = true) {
  const context = useContext(AuthContext);
  if (!context && required) throw new Error("useAuth must be used within AuthProvider");
  return context || { status: "anonymous", user: null, isAdmin: false, logout: async () => clearAccessToken(), endSession: () => clearAccessToken(), sessionNotice: null, clearSessionNotice: () => {} };
}
