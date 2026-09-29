/**
 * Store-readiness / security guards on the actual project files. Cheap and offline: they fail the
 * moment a debug artifact, hard-coded secret, insecure setting or broken deep-link config sneaks back in.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const app = json('app.json').expo;
const eas = json('eas.json');

function* sources(dir = root) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo', 'tests', 'scripts', 'assets'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* sources(full);
    else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) yield full;
  }
}
const rel = (f) => path.relative(root, f).replace(/\\/g, '/');

test('identifiers, versions and scheme are set for both stores', () => {
  assert.equal(app.scheme, 'tracktrail');
  assert.equal(app.ios.bundleIdentifier, 'com.tracktrail.mobile');
  assert.equal(app.android.package, 'com.tracktrail.mobile');
  assert.match(app.version, /^\d+\.\d+\.\d+$/);
  assert.ok(app.ios.buildNumber && app.android.versionCode >= 1);
  assert.equal(eas.cli.appVersionSource, 'remote', 'build numbers are managed by EAS, not hand-edited');
  assert.equal(eas.build.production.autoIncrement, true);
});

test('privacy: no backups of app data, no cleartext in release, unused permissions blocked, iOS export/privacy manifest declared', () => {
  assert.equal(app.android.allowBackup, false);
  for (const p of ['android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.RECORD_AUDIO', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE'])
    assert.ok(app.android.blockedPermissions.includes(p), p);
  assert.equal(app.ios.infoPlist.ITSAppUsesNonExemptEncryption, false);
  assert.ok(app.ios.privacyManifests.NSPrivacyAccessedAPITypes.length >= 1);
  const cfg = read('app.config.ts');
  assert.match(cfg, /usesCleartextTraffic:\s*!isReleaseBuild/);
  assert.match(cfg, /must be set to an https:\/\/ URL/, 'release builds fail at build time without an https API URL');
});

test('release channels: staging and production are separate, over-the-air updates fully configured', () => {
  assert.equal(eas.build.production.channel, 'production');
  assert.equal(eas.build.staging.channel, 'staging');
  assert.notEqual(eas.build.production.channel, eas.build.staging.channel);
  assert.equal(eas.build.production.env.EXPO_PUBLIC_APP_ENV, 'production');
  assert.equal(eas.build.staging.env.EXPO_PUBLIC_APP_ENV, 'staging');
  assert.equal(eas.build.production.android.buildType, 'app-bundle', 'Play Store requires an AAB');
  assert.deepEqual(app.runtimeVersion, { policy: 'appVersion' }, 'an OTA update can only reach binaries with a matching runtime');
  assert.ok(app.updates.url.includes(app.extra.eas.projectId));
});

test('deep links: verified https links + custom scheme are configured; one reset-password route only', () => {
  const cfg = read('app.config.ts');
  assert.match(cfg, /autoVerify:\s*true/);
  assert.match(cfg, /associatedDomains/);
  assert.match(cfg, /pathPrefix:\s*'\/app'/);
  assert.ok(fs.existsSync(path.join(root, 'app/+native-intent.ts')));
  const resets = [...sources(path.join(root, 'app'))].filter((f) => /reset-password\.tsx$/.test(f));
  assert.deepEqual(resets.map(rel), ['app/reset-password.tsx'], 'a duplicate route file makes "/reset-password" ambiguous');
  assert.ok(app.plugins.some((p) => (Array.isArray(p) ? p[0] : p) === 'expo-notifications'));
});

test('no debug artifacts: no console.*, TEMP DIAGNOSTIC blocks, or __DEV__ network logging outside the logger', () => {
  const offenders = [];
  for (const f of sources()) {
    const r = rel(f);
    if (['services/logger.ts', 'services/config.ts'].includes(r)) continue;
    const src = fs.readFileSync(f, 'utf8');
    if (/\bconsole\.(log|warn|error|debug|info)\(/.test(src) || /TEMP DIAGNOSTIC|\[api\]\[diag\]/.test(src)) offenders.push(r);
  }
  assert.deepEqual(offenders, [], 'use services/logger.ts (silent in release, redacts secrets)');
});

test('no hard-coded secrets or production credentials in the app bundle sources', () => {
  const patterns = [/AIza[0-9A-Za-z_-]{30,}/, /sk-[A-Za-z0-9]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, /re_[A-Za-z0-9]{20,}/, /https:\/\/[a-f0-9]{32}@[a-z0-9.]+\.sentry\.io/];
  for (const f of sources()) {
    const src = fs.readFileSync(f, 'utf8');
    for (const re of patterns) assert.doesNotMatch(src, re, `${rel(f)} matches ${re}`);
  }
  for (const p of ['app.json', 'eas.json', '.env.example']) assert.doesNotMatch(read(p), /AIza|sk-[A-Za-z0-9]{20}|PRIVATE KEY/, p);
  assert.match(read('.gitignore'), /^\.env$/m);
  assert.match(read('.gitignore'), /google-services\.json/);
});

test('crash reporting is privacy-safe: no default PII, request data dropped, console/network breadcrumbs dropped', () => {
  const m = read('services/monitoring.ts');
  assert.match(m, /sendDefaultPii:\s*false/);
  assert.match(m, /delete e\.request/);
  assert.match(m, /category === 'console'/);
  assert.match(m, /attachScreenshot:\s*false/);
  assert.match(m, /setMonitoringUser[\s\S]*String\(id\)/, 'user identified by numeric id only');
});

test('secure storage: tokens live only in SecureStore (never AsyncStorage) and are wiped on logout', () => {
  const store = read('services/tokenStore.ts');
  assert.match(store, /expo-secure-store/);
  assert.doesNotMatch(store, /async-storage/, 'tokenStore must not import AsyncStorage');
  assert.match(store, /AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY/);
  const auth = read('providers/AuthProvider.tsx');
  assert.match(auth, /clearSession\(\)/);
  assert.match(auth, /clearQueryCache\(\)/, 'cached user data is removed on sign-out');
  for (const f of sources()) {
    const src = fs.readFileSync(f, 'utf8');
    if (rel(f) === 'services/tokenStore.ts') continue;
    assert.doesNotMatch(src, /AsyncStorage\.(set|get)Item\([^)]*(token|password|refresh)/i, rel(f));
  }
});

test('settings: no fake toggles, real account deletion and legal links are wired', () => {
  const s = read('app/account/settings.tsx');
  assert.doesNotMatch(s, /Email notifications/, 'there is no email-notification backend');
  assert.match(s, /deleteAccount\(password\)/);
  assert.match(s, /DELETE_ACCOUNT_URL/);
  assert.match(read('app/legal/privacy.tsx'), /PRIVACY_URL/);
  assert.match(read('app/legal/terms.tsx'), /TERMS_URL/);
});

test('accessibility basics: charts are described to screen readers; text scaling is capped, not disabled', () => {
  assert.match(read('components/charts/bar-chart.tsx'), /accessibilityLabel=\{describeBars/);
  assert.match(read('components/charts/donut-chart.tsx'), /accessibilityLabel=\{describeDonut/);
  const t = read('components/themed-text.tsx');
  assert.match(t, /maxFontSizeMultiplier = 1\.4/);
  assert.doesNotMatch(t, /allowFontScaling=\{false\}/);
});

test('Home typography: Inter is loaded, mapped per weight, and Home uses the shared scale (no emoji glyph buttons)', () => {
  const layout = read('app/_layout.tsx');
  assert.match(layout, /@expo-google-fonts\/inter/);
  assert.match(layout, /Inter_400Regular[\s\S]*Inter_700Bold/);
  assert.match(read('constants/theme.ts'), /fontFamilyForWeight/);
  const home = read('app/(drawer)/(tabs)/index.tsx');
  assert.doesNotMatch(home, /[\u{1F300}-\u{1FAFF}\u2B50\u2709\u2B06\uFF0B]/u, 'emoji glyphs were replaced by clean labels');
  assert.match(read('components/dashboard-header.tsx'), /BellIcon/);
});
