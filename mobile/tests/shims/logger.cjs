// Test stand-in for services/logger.ts (the real one is unit-tested separately in query-cache-and-logger.test.cjs).
module.exports = { reportError: () => {}, logger: { debug() {}, info() {}, warn() {}, error() {} }, scrubString: (s) => s, redact: (v) => v, setErrorReporter() {} };
