// REAL-SQL ownership tests: the migration (incl. legacy-data backfill + trigger + partial unique
// indexes) and the raw-SQL ingestion / dedup path, run against a throwaway Postgres database.
//
//   TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm test
//
// Skipped (not failed) when TEST_DATABASE_URL is not set. A scratch database is created and
// dropped by the test; the given database itself is never modified.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Client, Pool } = require("pg");

const URL_ = process.env.TEST_DATABASE_URL;
const skip = !URL_ && "set TEST_DATABASE_URL to run the real-Postgres ownership tests";

const MIGRATION = fs.readFileSync(path.join(__dirname, "..", "..", "prisma", "migrations", "20261004000000_ownership_scopes_and_notifications", "migration.sql"), "utf8");

// Minimal pre-migration shape of the tables the migration touches (old unique constraint included).
const BASELINE = `
CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT UNIQUE, role TEXT DEFAULT 'user');
CREATE TABLE job_sources (id SERIAL PRIMARY KEY, name VARCHAR(50) UNIQUE NOT NULL, base_url VARCHAR(255), created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE companies (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, normalized_name VARCHAR(255) UNIQUE NOT NULL, domain VARCHAR(255), created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE jobs (
  id BIGSERIAL PRIMARY KEY, company_id INT REFERENCES companies(id), title VARCHAR(255) NOT NULL, normalized_title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL, location VARCHAR(255), remote_type VARCHAR(20), salary_text VARCHAR(255), skills TEXT[] DEFAULT '{}',
  source_id INT REFERENCES job_sources(id), source_url VARCHAR(1000) NOT NULL, external_job_id VARCHAR(255),
  canonical_job_id BIGINT REFERENCES jobs(id), status VARCHAR(20) DEFAULT 'new', posted_at TIMESTAMPTZ, scraped_at TIMESTAMPTZ DEFAULT now(),
  content_hash VARCHAR(64) NOT NULL, CONSTRAINT jobs_source_id_external_job_id_key UNIQUE (source_id, external_job_id));
CREATE TABLE tracked_jobs (id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE, company VARCHAR(255), role VARCHAR(255),
  source_name VARCHAR(50) DEFAULT 'manual', engine_job_id BIGINT);
`;

let admin, pool, dbName, queued;
const q = (sql, p) => pool.query(sql, p);

test.before(async () => {
  if (skip) return;
  admin = new Client({ connectionString: URL_ });
  await admin.connect();
  dbName = `tt_isolation_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE DATABASE ${dbName}`);
  const u = new URL(URL_); u.pathname = `/${dbName}`;
  pool = new Pool({ connectionString: u.toString() });
  await q(BASELINE);
});
test.after(async () => {
  if (skip) return;
  await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});

test("migration backfills legacy data, then is idempotent", { skip }, async () => {
  await q(`INSERT INTO users (email) VALUES ('a@x'),('b@x'),('c@x')`);
  await q(`INSERT INTO job_sources (name) VALUES ('manual'),('gmail'),('extension'),('linkedin'),('indeed'),('naukri')`);
  await q(`INSERT INTO companies (name, normalized_name) VALUES ('Acme','acme'),('Orphan','orphan')`);
  const src = async (n) => (await q(`SELECT id FROM job_sources WHERE name=$1`, [n])).rows[0].id;
  const ins = async (title, source, ext) => (await q(`INSERT INTO jobs (company_id,title,normalized_title,description,source_id,source_url,external_job_id,content_hash) VALUES (1,$1,$1,'d',$2,'http://x',$3,$1) RETURNING id`, [title, await src(source), ext])).rows[0].id;
  const global1 = await ins("global", "linkedin", "g1");
  const mine = await ins("legacy-private-of-user2", "manual", "m1");
  const orphan = await ins("legacy-private-nobody", "gmail", "o1");
  await q(`INSERT INTO tracked_jobs (user_id, company, role, source_name, engine_job_id) VALUES (2,'Acme','r','manual',$1)`, [mine]);
  // user 3 was (wrongly) merged into user 2's private job by the old cross-user dedup
  await q(`INSERT INTO tracked_jobs (user_id, company, role, source_name, engine_job_id) VALUES (3,'Acme','r','manual',$1)`, [mine]);
  // an extension save tagged with the website name, never bridged
  await q(`INSERT INTO tracked_jobs (user_id, company, role, source_name) VALUES (2,'Acme','x','LinkedIn')`);
  // an application from the global catalog stays attributed to its global source
  await q(`INSERT INTO tracked_jobs (user_id, company, role, source_name, engine_job_id) VALUES (2,'Acme','y','linkedin',$1)`, [global1]);

  await q(MIGRATION);
  await q(MIGRATION); // idempotent

  const scopes = Object.fromEntries((await q(`SELECT name, scope FROM job_sources`)).rows.map((r) => [r.name, r.scope]));
  assert.deepEqual([scopes.manual, scopes.gmail, scopes.extension], ["private", "private", "private"]);
  assert.deepEqual([scopes.linkedin, scopes.indeed, scopes.naukri], ["global", "global", "global"]);
  const own = (id) => q(`SELECT owner_user_id FROM jobs WHERE id=$1`, [id]).then((r) => r.rows[0] && r.rows[0].owner_user_id);
  assert.equal(await own(global1), null, "global job stays ownerless");
  assert.equal(await own(mine), 2, "legacy private job gets its owner");
  assert.equal((await q(`SELECT 1 FROM jobs WHERE id=$1`, [orphan])).rowCount, 0, "unattributable private job removed");
  const t3 = (await q(`SELECT engine_job_id FROM tracked_jobs WHERE user_id=3`)).rows[0];
  assert.equal(t3.engine_job_id, null, "user 3 no longer linked to user 2's private job");
  const ext = (await q(`SELECT source_name, platform FROM tracked_jobs WHERE role='x'`)).rows[0];
  assert.deepEqual([ext.source_name, ext.platform], ["extension", "linkedin"]);
  const cat = (await q(`SELECT source_name FROM tracked_jobs WHERE role='y'`)).rows[0];
  assert.equal(cat.source_name, "linkedin", "catalog application keeps its global source");
});

test("trigger: private source needs an owner, global source can't have one, owner can't change", { skip }, async () => {
  const src = async (n) => (await q(`SELECT id FROM job_sources WHERE name=$1`, [n])).rows[0].id;
  const raw = async (source, owner, ext) => q(`INSERT INTO jobs (company_id,title,normalized_title,description,source_id,source_url,external_job_id,content_hash,owner_user_id) VALUES (1,'t','t','d',$1,'u',$2,'h',$3) RETURNING id`, [await src(source), ext, owner]);
  await assert.rejects(raw("gmail", null, "t1"), /must have an owner/);
  await assert.rejects(raw("linkedin", 1, "t2"), /must not be owned/);
  const ok = await raw("gmail", 1, "t3");
  await assert.rejects(q(`UPDATE jobs SET owner_user_id = 2 WHERE id=$1`, [ok.rows[0].id]), /cannot change owner/);
  await assert.rejects(q(`UPDATE jobs SET source_id=$1 WHERE id=$2`, [await src("linkedin"), ok.rows[0].id]), /must not be owned/);
});

test("ingestJob: ownership, scoped dedup and per-owner uniqueness on real SQL", { skip }, async () => {
  // route the service's raw-SQL helper at the scratch DB
  const prismaPath = require.resolve("../../lib/prisma");
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { query: (sql, params) => pool.query(sql, params) } };
  queued = [];
  const queuePath = require.resolve("../../queue");
  require.cache[queuePath] = { id: queuePath, filename: queuePath, loaded: true, exports: { matchQueue: { add: async (n, d) => queued.push(d) } } };
  delete require.cache[require.resolve("../../services/ingestionService")];
  delete require.cache[require.resolve("../../services/dedupService")];
  const { ingestJob } = require("../../services/ingestionService");

  await q(`DELETE FROM jobs; DELETE FROM companies`);
  const job = (over = {}) => ({ title: "Backend Engineer", company: "Initech", description: "Build APIs in Node and Postgres for payments.", sourceName: "gmail", sourceUrl: "http://x/1", externalJobId: "e1", ...over });
  const owner = async (id) => (await q(`SELECT owner_user_id, status, canonical_job_id FROM jobs WHERE id=$1`, [id])).rows[0];

  // global job: never owned, even if a caller passes an owner
  const g = await ingestJob(job({ sourceName: "linkedin", externalJobId: "g", ownerUserId: 1 }));
  assert.equal((await owner(g.jobId)).owner_user_id, null);

  // private job without owner is refused
  await assert.rejects(ingestJob(job({ sourceName: "gmail", externalJobId: "p0" })), /need an ownerUserId/);

  // user 1 and user 2 save the SAME posting privately: two separate rows, never merged
  const a = await ingestJob(job({ description: "Private role at Initech, unique text A.", ownerUserId: 1 }));
  const b = await ingestJob(job({ description: "Private role at Initech, unique text A.", ownerUserId: 2 }));
  assert.equal(a.status, "new"); assert.equal(b.status, "new", "user 2 must not be a duplicate of user 1's private job");
  assert.notEqual(a.jobId, b.jobId);
  assert.equal((await owner(a.jobId)).owner_user_id, 1);
  assert.equal((await owner(b.jobId)).owner_user_id, 2);

  // same user saving it again IS a duplicate (of their own row)
  const a2 = await ingestJob(job({ description: "Private role at Initech, unique text A.", ownerUserId: 1, externalJobId: "e-other" }));
  assert.equal(a2.status, "duplicate");
  assert.equal(String(a2.canonicalJobId), String(a.jobId));

  // a private save identical to a GLOBAL job duplicates the global one (visible to all) - not another private row
  const gDesc = "Global posting text for Initech platform team.";
  const g2 = await ingestJob(job({ sourceName: "indeed", externalJobId: "gx", description: gDesc }));
  const mineDup = await ingestJob(job({ sourceName: "extension", externalJobId: "px", description: gDesc, ownerUserId: 1 }));
  assert.equal(mineDup.status, "duplicate");
  assert.equal(String(mineDup.canonicalJobId), String(g2.jobId));

  // the same external id is allowed for different owners, and re-ingest by one owner is idempotent
  const x1 = await ingestJob(job({ sourceName: "extension", externalJobId: "same", title: "SRE", description: "SRE text one", ownerUserId: 1 }));
  const x2 = await ingestJob(job({ sourceName: "extension", externalJobId: "same", title: "SRE", description: "SRE text one", ownerUserId: 2 }));
  assert.equal(x2.status, "new"); assert.notEqual(x1.jobId, x2.jobId);
  const again = await ingestJob(job({ sourceName: "extension", externalJobId: "same", title: "SRE", description: "SRE text one", ownerUserId: 1 }));
  assert.equal(again.status, "duplicate");
  assert.equal(String(again.canonicalJobId), String(x1.jobId));
  assert.equal((await q(`SELECT count(*)::int n FROM jobs WHERE owner_user_id=1 AND external_job_id='same'`)).rows[0].n, 1);

  // matching is only ever queued for the owner of a private job
  assert.ok(queued.some((m) => m.jobId == a.jobId && m.ownerUserId === 1));
  assert.ok(!queued.some((m) => m.jobId == a.jobId && m.ownerUserId === 2));

  // company rows are shared (no duplicates)...
  assert.equal((await q(`SELECT count(*)::int n FROM companies WHERE normalized_name='initech'`)).rows[0].n, 1);
  // ...but visible only through visible jobs: user 2 can reach Initech via the global jobs here
  const visibleTo = async (uid) => (await q(`SELECT id FROM jobs WHERE (owner_user_id IS NULL OR owner_user_id=$1) AND status<>'duplicate'`, [uid])).rows.map((r) => String(r.id));
  const v1 = await visibleTo(1), v2 = await visibleTo(2);
  assert.ok(v1.includes(String(a.jobId)) && !v2.includes(String(a.jobId)));
  assert.ok(v2.includes(String(b.jobId)) && !v1.includes(String(b.jobId)));
  assert.ok(v1.includes(String(g.jobId)) && v2.includes(String(g.jobId)));
});
