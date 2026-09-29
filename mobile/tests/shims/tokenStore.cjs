// Test stand-in for services/tokenStore.ts (expo-secure-store is native-only).
// Mirrors its public API with an in-memory implementation.
const state = { token: null, refresh: null, expiresAt: null, user: null, cleared: 0, sets: 0 };
module.exports = {
  __state: state,
  getToken: () => state.token,
  getRefreshToken: () => state.refresh,
  getAccessExpiresAt: () => state.expiresAt,
  getCachedUser: () => state.user,
  hydrateSession: async () => ({ hasSession: Boolean(state.token || state.refresh) }),
  setSession: async (t, user) => {
    state.token = t.accessToken;
    if (t.refreshToken !== undefined) state.refresh = t.refreshToken;
    state.expiresAt = t.accessTokenExpiresAt ? Date.parse(t.accessTokenExpiresAt) : null;
    if (user) state.user = user;
    state.sets += 1;
  },
  clearSession: async () => {
    state.token = state.refresh = state.expiresAt = state.user = null;
    state.cleared += 1;
  },
  clearToken: async () => module.exports.clearSession(),
};
