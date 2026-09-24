/**
 * Notification deep-linking is UI wiring inside React Native components/
 * context (AsyncStorage, react-native primitives) that can't be `require`d
 * under plain Node without a full RN shim. Following the same pattern the
 * existing "mobile source" test in resume-service.integration.test.cjs
 * uses for UI wiring, these are static assertions on the real source: they
 * fail if the navigation wiring is removed or reverted, without needing a
 * React Native runtime.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('notification target type exists and is a plain Expo Router pathname/params pair', () => {
  const types = read('types/notifications.ts');
  assert.match(types, /interface NotificationTarget/);
  assert.match(types, /pathname:\s*string/);
  assert.match(types, /target\?:\s*NotificationTarget/);
});

test('every real notification event maps to a target route (application, interview, resume, tailored)', () => {
  const ctx = read('context/NotificationContext.tsx');
  assert.match(ctx, /case 'application_submitted':[\s\S]{0,300}target:\s*\{\s*pathname:\s*'\/application\/\[id\]'/);
  assert.match(ctx, /case 'application_status_changed':[\s\S]{0,700}target:\s*\{\s*pathname:\s*'\/application\/\[id\]'/);
  assert.match(ctx, /case 'resume_updated':[\s\S]{0,200}target:\s*\{\s*pathname:\s*'\/resumes'\s*\}/);
  assert.match(ctx, /case 'resume_tailored':[\s\S]{0,300}target:\s*\{\s*pathname:\s*'\/tailor'/);
});

test('notifications screen navigates via the existing Expo Router (router.push), guarded so an invalid/missing target never crashes', () => {
  const screen = read('app/(drawer)/(tabs)/notifications.tsx');
  assert.match(screen, /from 'expo-router'/);
  assert.match(screen, /router\.push\(/);
  assert.match(screen, /try\s*\{[\s\S]*router\.push[\s\S]*\}\s*catch/);
  assert.match(screen, /markAsRead\(item\.id\)/);
  assert.doesNotMatch(screen, /@react-navigation\//);
});

test('application events carry the real trackedJobId (not a placeholder) so the deep link resolves to the actual record', () => {
  const hook = read('hooks/use-applications.ts');
  assert.match(hook, /trackedJobId:\s*result\.id/);
  assert.match(hook, /trackedJobId,?\s*\}\);/);
});

test('a completed tailoring run emits a deep-linkable notification carrying the real versionId', () => {
  const hook = read('hooks/use-resume.ts');
  assert.match(hook, /emitNotificationEvent\(\{\s*type:\s*'resume_tailored',\s*versionId:\s*done\.versionId\s*\}\)/);
});

test('notification dismissal/removal is unchanged: the list still wires onDelete to remove(id)', () => {
  const screen = read('app/(drawer)/(tabs)/notifications.tsx');
  assert.match(screen, /onDelete=\{\(\) => remove\(item\.id\)\}/);
});
