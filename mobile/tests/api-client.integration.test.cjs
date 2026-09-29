/**
 * API client + session recovery, run against a REAL local HTTP server.
 * Real: services/api.ts, services/session.ts, services/config.ts, services/connectivity.ts.
 * Stubbed (native-only): token store (in-memory, same API), session-event bus, logger sink.
 * Covers the "API failures" critical path: expired tokens, refresh rotation, 401 recovery,
 * 429/5xx retry policy, offline, and user-safe messages.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { loadTs, stub, root } = require('./helpers/load-ts.cjs');

global.__DEV__ = false;
stub('@/services/tokenStore', path.join(__dirname, 'shims/tokenStore.cjs'));
stub('@/services/sessionEvents', path.join(__dirname, 'shims/sessionEvents.cjs'));
stub('@/services/logger', path.join(__dirname, 'shims/logger.cjs'));
const tokenStore = require(path.join(__dirname, 'shims/tokenStore.cjs'));
const events = require(path.join(__dirname, 'shims/sessionEvents.cjs'));

// ---- fake backend ----
const hits = { refresh: 0, data: 0, flaky: 0, post: 0, limited: 0, login: 0 };
const seen = { headers: null };
let refreshMode = 'ok'; // ok | invalid | down | in_progress
let issued = 0;
const VALID = () => `access-${issued}`;

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  let body = '';
  for await (const c of req) body += c;
  const send = (status, json, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(json));
  };
  if (url === '/api/auth/refresh') {
    hits.refresh += 1;
    await new Promise((r) => setTimeout(r, 40)); // widen the race window for the single-flight test
    if (refreshMode === 'down') return send(503, { message: 'db down' });
    if (refreshMode === 'invalid') return send(401, { message: 'Session expired', code: 'session_invalid' });
    if (refreshMode === 'in_progress') return send(401, { message: 'x', code: 'refresh_in_progress' });
    issued += 1;
    return send(200, {
      token: VALID(), accessToken: VALID(), accessTokenExpiresAt: new Date(Date.now() + 900000).toISOString(),
      expiresIn: 900, refreshToken: `refresh-${issued}-`.padEnd(40, 'x'), user: { id: 1, name: 'Ada', email: 'a@b.co' },
    });
  }
  if (url === '/api/auth/login') { hits.login += 1; return send(401, { message: 'Invalid email or password' }); }
  if (url === '/api/data') {
    hits.data += 1;
    seen.headers = req.headers;
    return req.headers.token === VALID() ? send(200, { ok: true }) : send(401, { message: 'Session expired', code: 'token_expired' });
  }
  if (url === '/api/flaky') { hits.flaky += 1; return hits.flaky === 1 ? send(503, { message: 'upstream' }) : send(200, { ok: true }); }
  if (url === '/api/post') { hits.post += 1; return send(503, { message: 'upstream' }); }
  if (url === '/api/limited') { hits.limited += 1; return send(429, { message: 'slow down', retryAfterSeconds: 1 }, { 'Retry-After': '1' }); }
  if (url === '/api/boom') return send(500, { message: 'SELECT * FROM users WHERE password = ... at pg.query (secret stack)' });
  if (url === '/api/notfound') return send(404, { message: 'Application not found' });
  send(404, { message: 'nope' });
});

let api, ApiError, connectivity, config;
test.before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  process.env.EXPO_PUBLIC_API_URL = `http://127.0.0.1:${server.address().port}`;
  ({ ApiError } = loadTs(path.join(root, 'types/api.ts')));
  config = loadTs(path.join(root, 'services/config.ts'));
  connectivity = loadTs(path.join(root, 'services/connectivity.ts'));
  ({ api } = loadTs(path.join(root, 'services/api.ts')));
});
test.after(() => server.close());
test.beforeEach(() => {
  Object.keys(hits).forEach((k) => (hits[k] = 0));
  Object.assign(tokenStore.__state, { token: null, refresh: null, expiresAt: null, user: null, cleared: 0, sets: 0 });
  events.__state.unauthorized = 0;
  refreshMode = 'ok';
  issued = 0;
  connectivity.setOnline(true);
});

const signedIn = ({ expiresInMs = 600000, access = 'stale-token' } = {}) => {
  tokenStore.__state.token = access;
  tokenStore.__state.refresh = 'refresh-0-'.padEnd(40, 'x');
  tokenStore.__state.expiresAt = Date.now() + expiresInMs;
};

test('every request carries the session token and the mobile client headers', async () => {
  issued = 1;
  tokenStore.__state.token = 'access-1';
  await api.get('/data');
  assert.equal(seen.headers.token, 'access-1');
  assert.equal(seen.headers['x-client'], 'mobile');
  assert.ok(seen.headers['x-app-version']);
});

test('401 with a refresh token: refreshes once, replays the request, and stores the ROTATED tokens', async () => {
  signedIn();
  const res = await api.get('/data');
  assert.equal(res.data.ok, true);
  assert.equal(hits.refresh, 1);
  assert.equal(hits.data, 2, 'original + one replay');
  assert.equal(tokenStore.__state.token, 'access-1');
  assert.match(tokenStore.__state.refresh, /^refresh-1-/, 'refresh token was rotated');
  assert.equal(events.__state.unauthorized, 0);
});

test('concurrent 401s share ONE refresh call (a second one would look like token theft)', async () => {
  signedIn();
  const results = await Promise.all(Array.from({ length: 6 }, () => api.get('/data')));
  assert.ok(results.every((r) => r.data.ok));
  assert.equal(hits.refresh, 1);
});

test('proactive refresh: a token about to expire is renewed BEFORE the request (no 401 round trip)', async () => {
  signedIn({ expiresInMs: 5000, access: 'access-0' });
  issued = 0;
  await api.get('/data'); // sends the refreshed access-1 token
  assert.equal(hits.refresh, 1);
  assert.equal(hits.data, 1, 'no wasted 401');
  assert.equal(seen.headers.token, 'access-1');
});

test('refresh rejected by the server: session is cleared and the app is told exactly once', async () => {
  signedIn();
  refreshMode = 'invalid';
  await assert.rejects(api.get('/data'), (e) => e instanceof ApiError && e.status === 401 && /sign in again/i.test(e.message));
  assert.equal(tokenStore.__state.token, null);
  assert.equal(tokenStore.__state.refresh, null);
  assert.equal(events.__state.unauthorized, 1);
});

test('refresh fails only because the server/network is down: user stays signed in (no surprise logout)', async () => {
  signedIn();
  refreshMode = 'down';
  await assert.rejects(api.get('/data'), (e) => e instanceof ApiError && e.isNetworkError === true);
  assert.equal(tokenStore.__state.refresh !== null, true, 'refresh token kept');
  assert.equal(events.__state.unauthorized, 0);
  assert.equal(tokenStore.__state.cleared, 0);
});

test('legacy 7-day token (no refresh token) that the server rejects ends the session', async () => {
  tokenStore.__state.token = 'legacy';
  await assert.rejects(api.get('/data'), (e) => e.status === 401);
  assert.equal(events.__state.unauthorized, 1);
  assert.equal(hits.refresh, 0);
});

test('a 401 from /auth/login (wrong password) is a form error, NOT a session expiry', async () => {
  signedIn();
  await assert.rejects(api.post('/auth/login', { email: 'a@b.co', password: 'x' }), (e) => e.status === 401 && e.message === 'Invalid email or password');
  assert.equal(events.__state.unauthorized, 0);
  assert.equal(tokenStore.__state.cleared, 0);
  assert.equal(hits.refresh, 0);
});

test('GET retries a transient 503 and succeeds; a POST is never retried (no duplicate writes)', async () => {
  tokenStore.__state.token = 'access-0';
  const ok = await api.get('/flaky');
  assert.equal(ok.data.ok, true);
  assert.equal(hits.flaky, 2);
  await assert.rejects(api.post('/post', { a: 1 }), (e) => e.status === 503);
  assert.equal(hits.post, 1);
});

test('429 honours Retry-After, retries the GET, then gives a friendly wait message', async () => {
  tokenStore.__state.token = 'access-0';
  const t = Date.now();
  await assert.rejects(api.get('/limited'), (e) => e instanceof ApiError && e.status === 429 && /wait 1 second/i.test(e.message) && e.retryAfterSeconds === 1);
  assert.equal(hits.limited, 3, 'initial + 2 retries');
  assert.ok(Date.now() - t >= 1900, 'waited for Retry-After between attempts');
});

test('offline: fails immediately with a clear message and never touches the network', async () => {
  tokenStore.__state.token = 'access-0';
  connectivity.setOnline(false);
  const t = Date.now();
  await assert.rejects(api.get('/data'), (e) => e instanceof ApiError && e.code === 'OFFLINE' && e.isNetworkError && /offline/i.test(e.message));
  assert.ok(Date.now() - t < 500);
  assert.equal(hits.data, 0);
  connectivity.setOnline(true);
  await api.get('/flaky').catch(() => {});
});

test('5xx bodies are never shown to users (they can contain SQL/stack details); 4xx messages are', async () => {
  tokenStore.__state.token = 'access-0';
  await assert.rejects(api.get('/boom'), (e) => e.status === 500 && e.message === 'Server error. Please try again.' && !/SELECT|pg\.query|secret/.test(e.message));
  await assert.rejects(api.get('/notfound'), (e) => e.status === 404 && e.message === 'Application not found');
});

test('unreachable server: network error after bounded retries, safe message', async () => {
  const net = require('node:net');
  const port = await new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
  // Reuse the real interceptors by re-pointing the real instance for this one call.
  const res = await api.get(`http://127.0.0.1:${port}/api/data`).then(() => null, (e) => e);
  assert.ok(res instanceof ApiError);
  assert.equal(res.isNetworkError, true);
  assert.match(res.message, /Unable to connect/);
});

test('release builds must use https; development may use http', () => {
  assert.equal(config.isSecureApiUrl('https://api.example.com', 'production'), true);
  assert.equal(config.isSecureApiUrl('http://api.example.com', 'production'), false);
  assert.equal(config.isSecureApiUrl('http://10.0.2.2:5000', 'staging'), false);
  assert.equal(config.isSecureApiUrl('http://10.0.2.2:5000', 'development'), true);
  assert.equal(config.isSecureApiUrl('', 'development'), false);
});
