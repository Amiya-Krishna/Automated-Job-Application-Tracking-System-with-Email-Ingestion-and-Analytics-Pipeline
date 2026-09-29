const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs, root } = require('./helpers/load-ts.cjs');

global.__DEV__ = false;
const qc = loadTs(path.join(root, 'utils/query-cache.ts'));
const logger = loadTs(path.join(root, 'services/logger.ts'));

test('offline cache is an allow-list: lists/analytics yes; resume, profile, gmail, tailoring, unknown never', () => {
  for (const k of [['applications'], ['applications', 'engine'], ['analytics', 'summary', 30], ['jobs', { q: 1 }], ['sources'], ['companies', 'detail', 3]]) {
    assert.equal(qc.shouldPersistQuery(k), true, JSON.stringify(k));
  }
  for (const k of [['resume', 'current'], ['resume', 'versions'], ['profile'], ['gmail', 'status'], ['notification-preferences'], ['scrape', 'history'], ['jobs', 'infinite', {}], ['unknown'], [], [42]]) {
    assert.equal(qc.shouldPersistQuery(k), false, JSON.stringify(k));
  }
});

test('cache is restored only for the SAME user and while fresh', () => {
  const now = Date.now();
  const cache = { v: 1, userId: 7, savedAt: now - 1000, state: {} };
  assert.equal(qc.isCacheRestorable(cache, 7, now), true);
  assert.equal(qc.isCacheRestorable(cache, 8, now), false, 'another user');
  assert.equal(qc.isCacheRestorable(cache, null, now), false);
  assert.equal(qc.isCacheRestorable({ ...cache, savedAt: now - qc.CACHE_MAX_AGE_MS - 1 }, 7, now), false, 'stale');
  assert.equal(qc.isCacheRestorable({ ...cache, v: 2 }, 7, now), false);
  assert.equal(qc.isCacheRestorable(null, 7, now), false);
});

test('logger redacts JWTs, bearer tokens, emails, long opaque tokens and sensitive keys', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.abcDEF123_-xyz';
  const s = logger.scrubString(`fail for ada@example.com using ${jwt} and Bearer abc.def-123 and ${'x'.repeat(40)}`);
  assert.doesNotMatch(s, /ada@example\.com|eyJ|abc\.def-123|x{40}/);
  const out = logger.redact({
    password: 'hunter2', token: jwt, refreshToken: 'r'.repeat(43), authorization: 'Bearer z', resume_text: 'my whole resume',
    emailBody: 'private mail', notes: 'secret note', description: 'jd', nested: { accessToken: 'abc', ok: 'visible' }, status: 500,
  });
  assert.equal(out.password, '[redacted]');
  assert.equal(out.token, '[redacted]');
  assert.equal(out.refreshToken, '[redacted]');
  assert.equal(out.resume_text, '[redacted]');
  assert.equal(out.emailBody, '[redacted]');
  assert.equal(out.notes, '[redacted]');
  assert.equal(out.nested.accessToken, '[redacted]');
  assert.equal(out.nested.ok, 'visible');
  assert.equal(out.status, 500);
});

test('reportError never throws and only forwards redacted context', () => {
  const seen = [];
  logger.setErrorReporter((e, ctx) => seen.push(ctx));
  logger.reportError(new Error('boom'), { password: 'p', detail: 'fine' });
  assert.deepEqual(seen[0], { password: '[redacted]', detail: 'fine' });
  logger.setErrorReporter(() => { throw new Error('reporter down'); });
  assert.doesNotThrow(() => logger.reportError(new Error('x')));
  logger.setErrorReporter(null);
});
