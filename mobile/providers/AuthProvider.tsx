import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import * as authService from '@/services/auth';
import { logger } from '@/services/logger';
import { setMonitoringUser } from '@/services/monitoring';
import { setSavedJobsUser } from '@/services/savedJobs';
import { clearQueryCache, restoreQueryCache, startQueryPersistence, stopQueryPersistence } from '@/services/queryPersistence';
import { unregisterPushDevice, forgetLocalPushToken, registerForPushIfPermitted, watchPushTokenChanges } from '@/services/push';
import { ensureFreshAccessToken } from '@/services/session';
import { onUnauthorized } from '@/services/sessionEvents';
import { clearSession, getCachedUser, getRefreshToken, getToken, hydrateSession, setCachedUser, setSession } from '@/services/tokenStore';
import { ApiError } from '@/types/api';
import type { AuthUser, LoginRequest, RegisterRequest } from '@/types/auth';

type AuthStatus = 'hydrating' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  /** True only when the server-verified role of the signed-in account is 'admin'. UI convenience; every admin API re-checks on the server. */
  isAdmin: boolean;
  /** Signed-in user. Restored from the device on cold start (works offline), then confirmed via GET /auth/me. */
  user: AuthUser | null;
  /** Set when the session was ended by the server (expired/revoked); the login screen can explain it. */
  sessionNotice: string | null;
  clearSessionNotice: () => void;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<{ message: string }>;
  logout: () => Promise<void>;
  /** Permanently deletes the account (server-side) and signs out. */
  deleteAccount: (password: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const REVALIDATE_AFTER_MS = 5 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('hydrating');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const lastValidatedRef = useRef(0);
  const endingRef = useRef(false);

  /** Wipes everything that belongs to the signed-in user. */
  const wipeLocalUserData = useCallback(async () => {
    stopQueryPersistence();
    queryClient.clear();
    await clearQueryCache();
    await forgetLocalPushToken();
    await setSavedJobsUser(null);
    setMonitoringUser(null);
  }, [queryClient]);

  const beginAuthenticated = useCallback(
    (u: AuthUser | null) => {
      setUser(u);
      setStatus('authenticated');
      if (u) {
        setMonitoringUser(u.id);
        void setSavedJobsUser(u.id);
        startQueryPersistence(queryClient, u.id);
      }
    },
    [queryClient],
  );

  // Confirms the session with GET /auth/me. Errors other than "session over"
  // (offline, 5xx) keep the user signed in; a real 401 is handled by services/api.ts
  // (which refreshes, or ends the session via emitUnauthorized).
  const validate = useCallback(async () => {
    try {
      const me = await authService.fetchMe();
      lastValidatedRef.current = Date.now();
      // Keep the server-verified role: dropping it here used to hide admin UI after every restart.
      const next = { id: me.id, name: me.name, email: me.email, role: me.role === 'admin' ? ('admin' as const) : ('user' as const) };
      setUser(next);
      void setCachedUser(next);
      setMonitoringUser(me.id);
    } catch {
      // Intentionally silent: offline / transient failures must not affect the session.
    }
  }, []);

  // ---- Startup: hydrate from SecureStore, restore cached reads, then validate ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { hasSession } = await hydrateSession();
      if (cancelled) return;
      if (!hasSession) {
        setStatus('unauthenticated');
        return;
      }
      const cached = getCachedUser();
      await restoreQueryCache(queryClient, cached?.id ?? null);
      if (cancelled) return;
      beginAuthenticated(cached);
      void validate();
    })();
    return () => {
      cancelled = true;
    };
  }, [queryClient, beginAuthenticated, validate]);

  // ---- Server ended the session (refresh rejected / legacy token expired) ----
  useEffect(() => {
    return onUnauthorized(() => {
      if (endingRef.current) return;
      endingRef.current = true;
      setUser(null);
      setStatus('unauthenticated');
      setSessionNotice('Your session has expired. Please sign in again.');
      void wipeLocalUserData().finally(() => {
        endingRef.current = false;
      });
    });
  }, [wipeLocalUserData]);

  // ---- Foreground recovery: refresh a stale token and re-confirm the session ----
  useEffect(() => {
    if (status !== 'authenticated') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void (async () => {
        if (getRefreshToken()) await ensureFreshAccessToken(60_000);
        if (getToken() && Date.now() - lastValidatedRef.current > REVALIDATE_AFTER_MS) await validate();
      })();
    });
    return () => sub.remove();
  }, [status, validate]);

  // ---- Push: keep this device registered while signed in (never prompts) ----
  useEffect(() => {
    if (status !== 'authenticated') return;
    void registerForPushIfPermitted();
    return watchPushTokenChanges();
  }, [status]);

  const login = useCallback(
    async (credentials: LoginRequest) => {
      const res = await authService.login(credentials);
      // Defence in depth: the server already refuses admin sign-in for non-admins (403), but never
      // start an admin-door session unless the verified role in the response says admin.
      if (credentials.role === 'admin' && res.user?.role !== 'admin') {
        throw new ApiError('This account does not have administrator access.', 403, false, null, 'admin_required');
      }
      await setSession({ accessToken: res.accessToken ?? res.token, refreshToken: res.refreshToken ?? null, accessTokenExpiresAt: res.accessTokenExpiresAt ?? null }, res.user);
      lastValidatedRef.current = Date.now();
      setSessionNotice(null);
      beginAuthenticated(res.user);
    },
    [beginAuthenticated],
  );

  const register = useCallback((payload: RegisterRequest) => authService.register(payload), []);

  const logout = useCallback(async () => {
    const refresh = getRefreshToken();
    // Best effort, bounded: never let a slow/offline server trap the user in the app.
    await Promise.race([
      (async () => {
        await unregisterPushDevice();
        if (refresh) await authService.logoutRemote(refresh);
      })().catch((e) => logger.warn('remote sign-out failed', e)),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
    await clearSession();
    setUser(null);
    setStatus('unauthenticated');
    setSessionNotice(null);
    await wipeLocalUserData();
  }, [wipeLocalUserData]);

  const deleteAccount = useCallback(
    async (password: string) => {
      await authService.deleteAccount(password); // throws on wrong password / offline
      await clearSession();
      setUser(null);
      setStatus('unauthenticated');
      await wipeLocalUserData();
    },
    [wipeLocalUserData],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ status, isAdmin: user?.role === 'admin', user, sessionNotice, clearSessionNotice: () => setSessionNotice(null), login, register, logout, deleteAccount }),
    [status, user, sessionNotice, login, register, logout, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
