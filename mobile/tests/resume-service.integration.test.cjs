/**
 * Mobile API integration test. The REAL services/api.ts (axios instance,
 * `token` header, error normalisation), services/resume.ts and types/api.ts
 * are transpiled on the fly and run against the REAL Express routes + tailoring
 * pipeline (in-memory repo). Only the native token store / session-event bus are
 * stubbed (they need expo-secure-store / React Native).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const fs = require('node:fs');
const ts = require('typescript');
const net = require('node:net');

// Record every TCP destination the mobile networking stack opens (proves it only ever talks to the TrackTrail API).
const destinations = new Set();
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const o = Array.isArray(args[0]) ? args[0][0] : args[0]; // createConnection passes a normalized [options, cb]
  if (o && typeof o === 'object' && o.port) destinations.add(`${o.host || 'localhost'}:${o.port}`);
  return origConnect.apply(this, args);
};

const root = path.resolve(__dirname, '..');
const server = path.resolve(root, '../server');
const shims = { '@/services/tokenStore': path.join(__dirname, 'shims/tokenStore.cjs'), '@/services/sessionEvents': path.join(__dirname, 'shims/sessionEvents.cjs') };

// --- tiny TS loader: '@/x' alias + on-the-fly transpile
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (shims[request]) return shims[request];
  if (request.startsWith('@/')) {
    const base = path.join(root, request.slice(2));
    for (const ext of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(base + ext)) return base + ext;
  }
  return origResolve.call(this, request, ...rest);
};
require.extensions['.ts'] = function (module, filename) {
  // CRLF sources + comment emission crash this TypeScript build's transpileModule, so normalise EOLs and drop comments.
  const src = fs.readFileSync(filename, 'utf8').replace(/\r\n/g, '\n');
  const out = ts.transpileModule(src, { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, removeComments: true } });
  module._compile(out.outputText, filename);
};

global.__DEV__ = false;
const { startApp, FakeLlm, LONG_TAIL } = require(path.join(server, 'tests/resumeTailoring/helpers.js'));
const fx = require(path.join(server, 'tests/resumeTailoring/fixtures.js'));
const tokenStore = require(shims['@/services/tokenStore']);
const sessionEvents = require(shims['@/services/sessionEvents']);

let app;
let svc;
let ApiError;
test.before(async () => {
  app = await startApp();
  app.repo._seedProfile(1, { resume_text: fx.RICH_RESUME });
  app.repo._seedProfile(3, { resume_text: fx.RICH_RESUME });
  process.env.EXPO_PUBLIC_API_URL = app.origin; // read by services/api.ts at import time
  svc = require(path.join(root, 'services/resume.ts'));
  ({ ApiError } = require(path.join(root, 'types/api.ts')));
});
test.after(() => app.close());
test.beforeEach(() => { tokenStore.__state.token = app.tokenFor(1); });

const seedJob = (userId = 1, description = fx.STRUCTURED_JD) => app.repo._seedTrackedJob(userId, { company: 'Google', role: 'Software Engineer Intern', description });

test('jobFromKey parses tracked/engine keys and rejects junk', () => {
  assert.deepEqual(svc.jobFromKey('tracked-12'), { trackedJobId: 12 });
  assert.deepEqual(svc.jobFromKey('engine-7'), { engineJobId: 7 });
  for (const bad of [undefined, null, '', 'jd-abc', 'tracked-x']) assert.equal(svc.jobFromKey(bad), null);
});

test('analyzeJob: match analysis, truthful missing skills, sent with the backend `token` header', async () => {
  const job = seedJob();
  const a = await svc.analyzeJob({ trackedJobId: job.id });
  assert.equal(typeof a.matchScore, 'number');
  assert.ok(a.missingSkills.includes('Docker'));
  assert.equal(a.requirements.find((r) => r.requirement === 'Docker').label, 'Missing / Not found in your profile');
  assert.ok(a.matchedSkills.includes('React'));
});

test('full mobile flow: tailor (real stages) -> preview -> review -> approve -> versions', async () => {
  const job = seedJob();
  const stages = [];
  const session = await svc.startTailoring({ trackedJobId: job.id });
  assert.ok(['queued', 'running', 'succeeded'].includes(session.status));
  const done = await svc.waitForSession(session.id, { onUpdate: (s) => stages.push(s.stage), intervalMs: 5 });
  assert.equal(done.status, 'succeeded');
  assert.equal(stages.at(-1), 'ready');

  const v = await svc.getVersion(done.versionId);
  assert.equal(v.status, 'draft');
  assert.ok(v.changes.length >= 4);
  assert.ok(v.changes.every((c) => c.reason && c.evidence.length > 0));
  assert.doesNotMatch(v.resumeText, /\bAWS\b|\bDocker\b/);

  const rejectAll = Object.fromEntries(v.changes.map((c) => [c.id, 'rejected']));
  const pv = await svc.previewVersion(v.id, rejectAll);
  assert.notEqual(pv.resumeText, v.resumeText, 'preview reflects the decisions (server-side)');

  const first = v.changes[0].id;
  const approved = await svc.approveVersion(v.id, { action: 'review', decisions: { [first]: 'accepted' } });
  assert.equal(approved.status, 'approved');
  assert.equal(approved.changes.filter((c) => c.status === 'accepted').length, 1);

  const list = await svc.listVersions();
  assert.equal(list.original.id, 'original');
  assert.equal(list.versions[0].acceptedCount, 1);
  const cur = await svc.getCurrentResume();
  assert.equal(cur.resume.sourceType, 'profile_text');
});

test('errors keep the backend message AND machine-readable code (ApiError.apiCode)', async () => {
  tokenStore.__state.token = app.tokenFor(99); // no resume
  await assert.rejects(svc.analyzeJob({ description: 'x'.repeat(300) }), (e) => e instanceof ApiError && e.status === 422 && e.apiCode === 'no_resume' && e.message === 'Upload your resume before tailoring.');
  tokenStore.__state.token = app.tokenFor(1);
  await assert.rejects(svc.analyzeJob({ description: 'React dev' }), (e) => e.status === 422 && e.apiCode === 'jd_too_short' && e.message === 'The job description does not contain enough information.');
  await assert.rejects(svc.analyzeJob({ trackedJobId: 999999 }), (e) => e.status === 404 && e.apiCode === 'job_not_found');
});

test("another user's job/version is invisible from the app (404)", async () => {
  const mine = seedJob(3);
  tokenStore.__state.token = app.tokenFor(3);
  const s = await svc.startTailoring({ trackedJobId: mine.id });
  const done = await svc.waitForSession(s.id, { intervalMs: 5 });
  tokenStore.__state.token = app.tokenFor(1);
  await assert.rejects(svc.getVersion(done.versionId), (e) => e.status === 404);
  await assert.rejects(svc.startTailoring({ trackedJobId: mine.id }), (e) => e.status === 404);
  await assert.rejects(svc.approveVersion(done.versionId, { action: 'accept_all' }), (e) => e.status === 404);
});

test('missing token -> 401 handled by the real interceptor (clears token, signals logout)', async () => {
  tokenStore.__state.token = null;
  const before = sessionEvents.__state.unauthorized;
  await assert.rejects(svc.listVersions(), (e) => e instanceof ApiError && e.status === 401);
  assert.equal(sessionEvents.__state.unauthorized, before + 1);
});

test('waitForSession surfaces failed runs with the server error code, honours cancel and timeout', async () => {
  const failed = { id: 's', status: 'failed', stage: 'ready', error: "None of this job's requirements are supported by your resume.", errorCode: 'no_matching_skills' };
  await assert.rejects(svc.waitForSession('s', { fetchSession: async () => failed }), (e) => e.apiCode === 'no_matching_skills' && /supported by your resume/.test(e.message));
  const running = { id: 's', status: 'running', stage: 'generating' };
  await assert.rejects(svc.waitForSession('s', { fetchSession: async () => running, timeoutMs: -1, sleep: async () => {} }), (e) => e.apiCode === 'timeout');
  await assert.rejects(svc.waitForSession('s', { fetchSession: async () => running, isCancelled: () => true }), (e) => e.apiCode === 'cancelled');
});

test('nothing to tailor (no supported skills) fails cleanly through the mobile service too', async () => {
  const ml = app.repo._seedTrackedJob(1, { company: 'X', role: 'ML Eng', description: 'Machine Learning Engineer\nRequirements\n- PyTorch\n- TensorFlow\n- Spark\n- Airflow\n' + LONG_TAIL });
  const s = await svc.startTailoring({ trackedJobId: ml.id });
  await assert.rejects(svc.waitForSession(s.id, { intervalMs: 5 }), (e) => e.apiCode === 'no_matching_skills');
});

test('SECURITY: the mobile app only ever contacts the TrackTrail API — never an AI provider', async () => {
  const before = destinations.size;
  const job = app.repo._seedTrackedJob(1, { company: 'G', role: 'SWE', description: fx.STRUCTURED_JD });
  const s = await svc.startTailoring({ trackedJobId: job.id }, true);
  await svc.waitForSession(s.id, { intervalMs: 5 });
  await svc.listVersions();
  assert.ok(destinations.size >= 1 && before >= 0);
  const port = new URL(app.origin).port;
  for (const d of destinations) assert.match(d, new RegExp(`^(127\\.0\\.0\\.1|localhost|::1):${port}$`), `unexpected network destination: ${d}`);
});
