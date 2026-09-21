/**
 * Static guards for the mobile project configuration. Cheap, offline, and aimed at the exact
 * failures that make Expo Go / dev clients report "java.io.IOException: Failed to download remote update":
 *   1. Metro can't build the bundle (HTTP 500) because app code imports @react-navigation/* (forbidden by
 *      Expo Router in SDK 56+), or because a dependency is out of step with the SDK.
 *   2. A half-configured over-the-air update setup.
 * `npm run verify:bundle` is the end-to-end check (builds the real bundle); these run in milliseconds.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const pkg = read('package.json');
const app = read('app.json').expo;
const eas = read('eas.json');
const deps = { ...pkg.dependencies, ...pkg.devDependencies };

function* sourceFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo', 'tests', 'scripts'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) yield full;
  }
}

test('no app source imports @react-navigation/* (Expo Router SDK 56+ fails the Metro bundle on it)', () => {
  const offenders = [];
  for (const f of sourceFiles(root)) {
    if (/from\s+['"]@react-navigation\/|require\(['"]@react-navigation\//.test(fs.readFileSync(f, 'utf8'))) offenders.push(path.relative(root, f));
  }
  assert.deepEqual(offenders, [], 'use expo-router/react-navigation and expo-router/drawer instead');
});

test('package.json has no direct @react-navigation/* dependencies (Expo Router bundles its own)', () => {
  assert.deepEqual(Object.keys(deps).filter((n) => n.startsWith('@react-navigation/')), []);
});

test('dependencies match the versions this Expo SDK expects (same check as `expo install --check`, offline)', (t) => {
  const bundled = path.join(root, 'node_modules/expo/bundledNativeModules.json');
  if (!fs.existsSync(bundled)) return t.skip('dependencies not installed');
  const expected = JSON.parse(fs.readFileSync(bundled, 'utf8'));
  const mismatched = Object.entries(deps).filter(([n, v]) => expected[n] && expected[n] !== v).map(([n, v]) => `${n}: ${v} (SDK expects ${expected[n]})`);
  assert.deepEqual(mismatched, []);
});

test('EAS project id is present and unchanged; the three build profiles exist', () => {
  assert.equal(app.extra.eas.projectId, '9e5ee126-24c9-4bcc-8138-6370f4a66221');
  for (const p of ['development', 'preview', 'production']) assert.ok(eas.build[p], `eas.json build.${p}`);
});

test('over-the-air updates are either fully configured or not configured at all (never half)', () => {
  const hasModule = Boolean(deps['expo-updates']);
  const urlSet = Boolean(app.updates && app.updates.url);
  const runtimeSet = Boolean(app.runtimeVersion);
  const channels = Object.entries(eas.build).filter(([, p]) => p.channel).map(([n]) => n);
  if (!hasModule) {
    // No expo-updates: no OTA capability exists, so nothing may claim one (a stray url/channel is what
    // produces "Failed to download remote update" in builds that try to honour it).
    assert.equal(urlSet, false, 'app.json updates.url is set but expo-updates is not installed');
    assert.equal(runtimeSet, false, 'app.json runtimeVersion is set but expo-updates is not installed');
    assert.deepEqual(channels, [], 'eas.json channels are set but expo-updates is not installed');
  } else {
    assert.ok(urlSet && app.updates.url.includes(app.extra.eas.projectId), 'updates.url must point at this EAS project');
    assert.ok(runtimeSet, 'runtimeVersion is required with expo-updates');
    for (const p of ['preview', 'production']) assert.ok(eas.build[p].channel, `eas.json build.${p}.channel is required with expo-updates`);
  }
});
