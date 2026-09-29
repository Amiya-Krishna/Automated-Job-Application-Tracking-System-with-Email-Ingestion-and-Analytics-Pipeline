/**
 * Deep links + notification navigation. Runs the REAL utils/deep-links.ts
 * (transpiled on the fly) — every entry point the app supports goes through it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('./helpers/load-ts.cjs');

const { resolveDeepLink, resolveNotificationTarget, parseIncoming } = loadTs(path.resolve(__dirname, '../utils/deep-links.ts'));
const TOKEN = 'a'.repeat(24) + '.' + 'b'.repeat(24);

test('password reset: custom scheme, legacy scheme, https App Link and Expo Go all open the SAME public screen with the token', () => {
  const expected = `/reset-password?token=${TOKEN}`;
  for (const url of [
    `tracktrail://reset-password?token=${TOKEN}`,
    `mobile://reset-password?token=${TOKEN}`,
    `https://api.example.com/app/reset-password?token=${TOKEN}`,
    `exp://192.168.1.5:8081/--/reset-password?token=${TOKEN}`,
  ]) {
    assert.deepEqual(resolveDeepLink(url), { kind: 'public', href: expected }, url);
  }
});

test('password reset: opens without a token for manual entry; a malformed token is dropped, never forwarded', () => {
  assert.deepEqual(resolveDeepLink('tracktrail://reset-password'), { kind: 'public', href: '/reset-password' });
  for (const bad of ['short', '<script>alert(1)</script>', 'a b c d e f g h i j k l m n o p', '../../etc/passwd']) {
    assert.deepEqual(resolveDeepLink(`tracktrail://reset-password?token=${encodeURIComponent(bad)}`), { kind: 'public', href: '/reset-password' });
  }
});

test('https links only count under /app on the API host; other paths and schemes are rejected', () => {
  assert.equal(resolveDeepLink('https://api.example.com/other/reset-password?token=' + TOKEN).kind, 'unknown');
  assert.equal(resolveDeepLink('http://api.example.com/app/reset-password').kind, 'unknown');
  for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'intent://x#Intent;end', 'data:text/html,hi', '', 'not a url']) {
    assert.equal(resolveDeepLink(bad).kind, 'unknown', bad);
  }
});

test('OAuth callback (Gmail) is never turned into a route', () => {
  assert.deepEqual(resolveDeepLink('tracktrail://gmail-callback?gmail=connected'), { kind: 'ignore' });
  assert.deepEqual(resolveDeepLink('exp://10.0.0.2:8081/--/gmail-callback?gmail=error'), { kind: 'ignore' });
});

test('protected links resolve to hrefs (so the app can hold them until sign-in); ids must be numeric', () => {
  assert.deepEqual(resolveDeepLink('tracktrail://application/42'), { kind: 'protected', href: '/application/42' });
  assert.deepEqual(resolveDeepLink('https://api.example.com/app/job/7'), { kind: 'protected', href: '/job/7' });
  assert.deepEqual(resolveDeepLink('tracktrail://tailor?versionId=9'), { kind: 'protected', href: '/tailor?versionId=9' });
  assert.deepEqual(resolveDeepLink('tracktrail://tailor?versionId=9;drop'), { kind: 'protected', href: '/tailor' });
  assert.deepEqual(resolveDeepLink('tracktrail://notifications'), { kind: 'protected', href: '/notifications' });
  for (const bad of ['tracktrail://application/abc', 'tracktrail://application/1/../../x', 'tracktrail://application/', 'tracktrail://admin', 'tracktrail://application/99999999999999999']) {
    assert.equal(resolveDeepLink(bad).kind, 'unknown', bad);
  }
});

test('router-style relative paths (used by Expo Router internally) are understood', () => {
  assert.deepEqual(parseIncoming('/application/5?x=1').path, '/application/5');
  assert.equal(resolveDeepLink('/').kind, 'public');
});

test('notification targets: allow-listed routes only, params validated, unknown payloads ignored', () => {
  const t = (pathname, params) => resolveNotificationTarget({ target: { pathname, params } });
  assert.equal(t('/application/[id]', { id: '12' }), '/application/12');
  assert.equal(t('/application/[id]', { id: 12 }), '/application/12');
  assert.equal(t('/application/[id]', { id: '12/../../x' }), '/applications', 'bad id falls back to the safe list screen');
  assert.equal(t('/job/[id]', { id: '5' }), '/job/5');
  assert.equal(t('/jobs'), '/jobs');
  assert.equal(t('/tailor', { versionId: '3' }), '/tailor?versionId=3');
  assert.equal(t('/notifications'), '/notifications');
  for (const bad of ['/account/settings', '/(auth)/login', 'https://evil.test', '//evil.test', '/reset-password', 'javascript:1', 42, null]) {
    assert.equal(t(bad), null, String(bad));
  }
  for (const bad of [null, undefined, 'x', 5, {}, { target: null }, { target: 'x' }, { target: {} }]) {
    assert.equal(resolveNotificationTarget(bad), null);
  }
});

test('server-generated reminder payloads (server/services/reminderService.js) resolve to real screens', () => {
  // Same shapes buildReminders() emits.
  assert.equal(resolveNotificationTarget({ type: 'interview', target: { pathname: '/application/[id]', params: { id: '11' } } }), '/application/11');
  assert.equal(resolveNotificationTarget({ type: 'job', target: { pathname: '/job/[id]', params: { id: '9' } } }), '/job/9');
  assert.equal(resolveNotificationTarget({ type: 'job', target: { pathname: '/jobs' } }), '/jobs');
  assert.equal(resolveNotificationTarget({ type: 'system', target: { pathname: '/notifications' } }), '/notifications');
});
