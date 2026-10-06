/**
 * Blocked accounts + self-service account deletion, against a REAL local HTTP server.
 * Real: services/api.ts, services/session.ts, services/auth.ts, utils/account-deletion.ts.
 * Stubbed (native-only): token store, session-event bus, logger.
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

const BLOCKED = { code: 'account_blocked', message: 'Your account has been blocked. Please contact an administrator.' };
const hits = { refresh: 0, data: 0, login: 0, del: 0 };
let deleteMode = 'ok'; // ok | wrong_password | last_admin
let refreshMode = 'blocked';
let lastDelete = null;

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  let body = '';
  for await (const c of req) body += c;
  const send = (status, json) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(json));
  };
  if (url === '/api/auth/login') { hits.login += 1; return send(403, BLOCKED); }
  if (url === '/api/auth/refresh') {
    hits.refresh += 1;
    return refreshMode === 'blocked' ? send(403, BLOCKED) : send(401, { message: 'Session expired', code: 'session_invalid' });
  }
  if (url === '/api/data') {
    hits.data += 1;
    // The access token is expired (401) unless the account is blocked (403).
    return req.headers.token === 'blocked-token' ? send(403, BLOCKED) : send(401, { message: 'Session expired', code: 'token_expired' });
  }
  if (url === '/api/auth/account' && req.method === 'DELETE') {
    hits.del += 1;
    lastDelete = { method: req.method, body: JSON.parse(body || '{}') };
    if (deleteMode === 'wrong_password') return send(400, { message: 'Password is incorrect' });
    if (deleteMode === 'last_admin') return send(409, { code: 'last_admin', message: 'You are the last active administrator. Promote another admin first.' });
    return send(200, { message: 'Account deleted' });
  }
  send(404, { message: 'nope' });
});

let api, ApiError, authService, connectivity, deletion;
test.before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  process.env.EXPO_PUBLIC_API_URL = `http://127.0.0.1:${server.address().port}`;
  ({ ApiError } = loadTs(path.join(root, 'types/api.ts')));
  loadTs(path.join(root, 'services/config.ts'));
  connectivity = loadTs(path.join(root, 'services/connectivity.ts'));
  ({ api } = loadTs(path.join(root, 'services/api.ts')));
  authService = loadTs(path.join(root, 'services/auth.ts'));
  deletion = loadTs(path.join(root, 'utils/account-deletion.ts'));
});
test.after(() => server.close());
test.beforeEach(() => {
  Object.keys(hits).forEach((k) => (hits[k] = 0));
  Object.assign(tokenStore.__state, { token: null, refresh: null, expiresAt: null, user: null, cleared: 0, sets: 0 });
  events.__state.unauthorized = 0;
  events.__state.reasons = [];
  deleteMode = 'ok';
  refreshMode = 'blocked';
  lastDelete = null;
  connectivity.setOnline(true);
});

const signedIn = (access) => {
  tokenStore.__state.token = access;
  tokenStore.__state.refresh = 'refresh-0-'.padEnd(40, 'x');
  tokenStore.__state.expiresAt = Date.now() + 600000;
};

test('403 account_blocked on an API call ends the session with reason "blocked"', async () => {
  signedIn('blocked-token');
  await assert.rejects(api.get('/data'), (e) =>
    e instanceof ApiError && e.status === 403 && e.apiCode === 'account_blocked' && e.message === BLOCKED.message && e.isNetworkError === false);
  assert.equal(tokenStore.__state.token, null);
  assert.equal(tokenStore.__state.refresh, null);
  assert.equal(tokenStore.__state.cleared, 1);
  assert.deepEqual(events.__state.reasons, ['blocked']);
  assert.equal(hits.data, 1, 'not retried');
  assert.equal(hits.refresh, 0, 'a 403 is not a token-expiry: no refresh attempt');
});

test('refresh rejected with 403 account_blocked (expired access token) ends the session as blocked, not "expired"', async () => {
  signedIn('stale');
  await assert.rejects(api.get('/data'), (e) => e instanceof ApiError && e.apiCode === 'account_blocked' && e.message === BLOCKED.message);
  assert.equal(tokenStore.__state.token, null);
  assert.equal(tokenStore.__state.refresh, null);
  assert.deepEqual(events.__state.reasons, ['blocked']);
});

test('a plain refresh rejection still ends the session with the generic reason (no argument)', async () => {
  signedIn('stale');
  refreshMode = 'invalid';
  await assert.rejects(api.get('/data'), (e) => e.status === 401 && /sign in again/i.test(e.message));
  assert.deepEqual(events.__state.reasons, [null]);
});

test('login with a blocked account surfaces the server message and does NOT end a session', async () => {
  signedIn('blocked-token');
  await assert.rejects(
    authService.login({ email: 'a@b.co', password: 'right-password' }),
    (e) => e instanceof ApiError && e.status === 403 && e.apiCode === 'account_blocked' && e.message === BLOCKED.message,
  );
  assert.equal(events.__state.unauthorized, 0);
  assert.equal(tokenStore.__state.cleared, 0);
});

test('deleteAccount sends DELETE /auth/account with the password', async () => {
  signedIn('access-1');
  const res = await authService.deleteAccount('my-password');
  assert.equal(res.message, 'Account deleted');
  assert.equal(lastDelete.method, 'DELETE');
  assert.deepEqual(lastDelete.body, { password: 'my-password' });
  assert.equal(events.__state.unauthorized, 0);
});

test('deleteAccount: wrong password (400) and last administrator (409) surface their messages', async () => {
  signedIn('access-1');
  deleteMode = 'wrong_password';
  await assert.rejects(authService.deleteAccount('nope'), (e) => e.status === 400 && e.message === 'Password is incorrect');
  deleteMode = 'last_admin';
  await assert.rejects(authService.deleteAccount('pw'), (e) =>
    e instanceof ApiError && e.status === 409 && e.apiCode === 'last_admin' && /last active administrator/.test(e.message));
  assert.equal(events.__state.unauthorized, 0, 'a failed deletion keeps the session');
  assert.equal(tokenStore.__state.cleared, 0);
});

test('isDeleteConfirmed requires the exact word DELETE and a non-empty password', () => {
  const { isDeleteConfirmed, DELETE_CONFIRM_WORD } = deletion;
  assert.equal(DELETE_CONFIRM_WORD, 'DELETE');
  assert.equal(isDeleteConfirmed('DELETE', 'pw'), true);
  assert.equal(isDeleteConfirmed('DELETE', ''), false);
  assert.equal(isDeleteConfirmed('delete', 'pw'), false);
  assert.equal(isDeleteConfirmed('Delete', 'pw'), false);
  assert.equal(isDeleteConfirmed(' DELETE', 'pw'), false);
  assert.equal(isDeleteConfirmed('DELETE ', 'pw'), false);
  assert.equal(isDeleteConfirmed('DELET', 'pw'), false);
  assert.equal(isDeleteConfirmed('', ''), false);
});
