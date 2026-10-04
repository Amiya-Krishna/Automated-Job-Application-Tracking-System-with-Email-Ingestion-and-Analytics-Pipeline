/** Source-level guards: funnel has no "scraped" stage; discovery UI is admin-gated. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('funnel type and screen no longer contain a scraped stage', () => {
  assert.doesNotMatch(read('types/analytics.ts').split('export interface FunnelData')[1].split('}')[0], /scraped/);
  const screen = read('app/(drawer)/(tabs)/analytics.tsx');
  assert.doesNotMatch(screen, /scraped|Jobs discovered/);
  assert.match(screen, /funnel\.data\?\.matched/);
});

test('Discovery panel renders only for admins and lists all discovery platforms', () => {
  const src = read('app/sources/index.tsx');
  assert.match(src, /user\?\.role === 'admin'/);
  assert.match(src, /isAdmin \? <DiscoveryPanel \/> : null/);
  for (const p of ['remotive', 'linkedin', 'indeed', 'naukri', 'internshala', 'wellfound', 'unstop']) assert.match(src, new RegExp(`value: '${p}'`));
  assert.match(read('types/auth.ts'), /role\?: 'user' \| 'admin'/);
});
