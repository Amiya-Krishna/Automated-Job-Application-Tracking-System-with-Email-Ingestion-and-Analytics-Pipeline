// Test stand-in for services/tokenStore.ts (expo-secure-store is native-only).
const state = { token: null, cleared: 0 };
module.exports = { __state: state, getToken: () => state.token, clearToken: async () => { state.token = null; state.cleared += 1; } };
