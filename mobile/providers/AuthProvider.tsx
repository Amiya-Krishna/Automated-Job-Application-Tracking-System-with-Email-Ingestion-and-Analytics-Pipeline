import { useQueryClient } from '@tanstack/react-query';
import { createContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import * as authService from '@/services/auth';
import { onUnauthorized } from '@/services/sessionEvents';
import { clearToken, hydrateToken, setToken } from '@/services/tokenStore';
import type { AuthUser, LoginRequest, RegisterRequest } from '@/types/auth';

type AuthStatus = 'hydrating' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  /**
   * The logged-in user's id/name/email. Populated directly from the
   * login response. On a cold app restart with an existing token, this
   * starts out `null` even though `status` is `authenticated` — the
   * backend has no "whoami" endpoint to re-fetch it from at startup
   * (see the Phase-analysis: adding one wasn't in scope for this step),
   * and a later phase's profile fetch (GET /api/profile) will populate
   * richer profile data anyway. Nothing in this phase renders `user`,
   * so this is a documented gap, not a hidden one.
   */
  user: AuthUser | null;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<{ message: string }>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Requires AuthProvider to render inside QueryProvider (see
  // app/_layout.tsx) — it is, and always must be.
  const queryClient = useQueryClient();

  // 'hydrating' until the SecureStore read finishes — see the effect
  // below. Nothing that depends on auth state (protected routes,
  // authenticated requests) should run while this is 'hydrating'.
  const [status, setStatus] = useState<AuthStatus>('hydrating');
  const [user, setUser] = useState<AuthUser | null>(null);

  // Guards against the "critical startup requirement": populate the
  // in-memory token from SecureStore, and ONLY THEN mark hydration
  // complete. Runs once per app launch.
  useEffect(() => {
    let cancelled = false;
    hydrateToken().then((token) => {
      if (cancelled) return;
      setStatus(token ? 'authenticated' : 'unauthenticated');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reacts to the API client's 401 event (services/sessionEvents.ts).
  // Guarded by a ref, not just the `status !== 'authenticated'` check in
  // state, because multiple in-flight requests can all 401 back-to-back
  // in the same tick, before the first one's setState has re-rendered —
  // the ref flips synchronously, so only the first 401 actually acts,
  // preventing multiple simultaneous "log the user out" operations /
  // redirect loops from a single burst of failed requests.
  const handlingUnauthorizedRef = useRef(false);
  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      if (handlingUnauthorizedRef.current) return;
      handlingUnauthorizedRef.current = true;
      setUser(null);
      setStatus('unauthenticated');
      queryClient.clear();
      // Reset once state has settled, so a genuinely new 401 later in
      // the session (e.g. after logging back in) is handled again.
      setTimeout(() => {
        handlingUnauthorizedRef.current = false;
      }, 0);
    });
    return unsubscribe;
  }, [queryClient]);

  const login = async (credentials: LoginRequest) => {
    const { token, user: loggedInUser } = await authService.login(credentials);
    await setToken(token);
    setUser(loggedInUser);
    setStatus('authenticated');
  };

  const register = async (payload: RegisterRequest) => {
    // Does NOT log the user in — see services/auth.ts and
    // authRoutes.js's actual contract. Caller (the register screen)
    // sends the user to the login screen afterward.
    return authService.register(payload);
  };

  const logout = async () => {
    await clearToken();
    setUser(null);
    setStatus('unauthenticated');
    // Every screen's fetched data (applications, jobs, analytics,
    // profile) belongs to the user who just logged out — clear it so
    // the next person to log in on this device never sees a flash of
    // the previous user's cached data before their own requests land.
    queryClient.clear();
  };

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, register, logout }),
    [status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
