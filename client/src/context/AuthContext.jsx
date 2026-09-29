import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { refreshAccessToken } from "../api";
import { clearAccessToken, setAccessToken } from "../utils/auth";

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);
  const restore = useCallback(async () => {
    setStatus("loading");
    try { await refreshAccessToken(); const { data } = await api.get("/auth/me"); setUser(data.user); setStatus("authenticated"); }
    catch { clearAccessToken(); setUser(null); setStatus("anonymous"); }
  }, []);
  useEffect(() => { restore(); const ended = () => { clearAccessToken(); setUser(null); setStatus("anonymous"); }; window.addEventListener("tracktrail:session-ended", ended); return () => window.removeEventListener("tracktrail:session-ended", ended); }, [restore]);
  const login = useCallback((data) => { setAccessToken(data.accessToken || data.token); setUser(data.user); setStatus("authenticated"); }, []);
  const logout = useCallback(async () => { try { await api.post("/auth/logout", undefined, { _skipAuthRefresh: true }); } catch { /* local sign-out still succeeds */ } clearAccessToken(); setUser(null); setStatus("anonymous"); }, []);
  const value = useMemo(() => ({ status, user, login, logout, restore }), [status, user, login, logout, restore]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(required = true) {
  const context = useContext(AuthContext);
  if (!context && required) throw new Error("useAuth must be used within AuthProvider");
  return context || { status: "anonymous", user: null, logout: async () => clearAccessToken() };
}
