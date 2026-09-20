// Test stand-in for services/sessionEvents.ts.
const state = { unauthorized: 0 };
module.exports = { __state: state, emitUnauthorized: () => { state.unauthorized += 1; } };
