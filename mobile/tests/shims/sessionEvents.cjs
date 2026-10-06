// Test stand-in for services/sessionEvents.ts.
const state = { unauthorized: 0, reasons: [] };
module.exports = {
  __state: state,
  emitUnauthorized: (reason) => { state.unauthorized += 1; state.reasons.push(reason ?? null); },
  onUnauthorized: () => () => {},
};
