#!/usr/bin/env node
/**
 * Verifies that the Metro dev server can actually BUILD the app's JavaScript bundle.
 *
 * Why this exists: when Expo Go / a dev client asks the dev server for the bundle and Metro fails
 * (HTTP 500), the client can only report "java.io.IOException: Failed to download remote update".
 * The app's own code is fine in that situation — the bundle simply could not be built (for example
 * an import that SDK 56+ Expo Router forbids, or a package that imports something it does not
 * declare). This script reproduces that request without a phone and prints Metro's real error.
 *
 *   npm run verify:bundle              # android + ios
 *   node scripts/verify-bundle.js android
 */
const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');

const PORT = Number(process.env.VERIFY_BUNDLE_PORT || 8097);
const platforms = process.argv.slice(2).length ? process.argv.slice(2) : ['android', 'ios'];
const ENTRY = 'node_modules/expo-router/entry.bundle';

function get(path, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Never trust a server that was already running: it may be serving stale code and would give a false "OK".
  try {
    await get('/status', 1500);
    console.error(`FAIL: something is already listening on port ${PORT}. Stop it, or set VERIFY_BUNDLE_PORT to a free port.`);
    process.exit(2);
  } catch { /* nothing listening — good */ }

  // --offline: never contact Expo's servers for this check. -c: clear the Metro cache.
  const posix = process.platform !== 'win32';
  const child = spawn('npx', ['expo', 'start', '-c', '--offline', '--port', String(PORT)], {
    stdio: 'ignore',
    shell: true,
    detached: posix, // own process group, so the WHOLE tree (npx -> expo -> node) can be stopped
    env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' },
  });
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      if (posix) process.kill(-child.pid, 'SIGKILL');
      else spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f']);
    } catch { /* already gone */ }
  };
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(130); });
  process.on('SIGTERM', () => { stop(); process.exit(143); });

  let up = false;
  for (let i = 0; i < 60 && !up; i += 1) {
    await sleep(2000);
    try { up = (await get('/status', 2000)).body.toString().includes('running'); } catch { /* not up yet */ }
  }
  if (!up) { stop(); console.error('FAIL: the Expo dev server did not start.'); process.exit(2); }

  let failed = false;
  for (const platform of platforms) {
    const url = `/${ENTRY}?platform=${platform}&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable`;
    const t0 = Date.now();
    try {
      const { status, body } = await get(url, 280000);
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      if (status === 200) {
        console.log(`OK    ${platform}: bundle built (${(body.length / 1e6).toFixed(1)} MB, ${secs}s)`);
      } else {
        failed = true;
        let msg = body.toString().slice(0, 600);
        try { msg = JSON.parse(body.toString()).message.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 900); } catch { /* keep raw */ }
        console.error(`FAIL  ${platform}: Metro returned HTTP ${status} after ${secs}s.\n      A phone would report this as "Failed to download remote update".\n      Metro says:\n${msg.split('\n').map((l) => '        ' + l).join('\n')}`);
      }
    } catch (e) {
      failed = true;
      console.error(`FAIL  ${platform}: ${e.message}`);
    }
  }
  stop();
  process.exit(failed ? 1 : 0);
}

main();
