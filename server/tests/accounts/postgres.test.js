// REAL-SQL check of migration 20261006000000_user_account_status against a throwaway Postgres
// database: new columns/defaults/CHECK, the match_scores FK becoming ON DELETE CASCADE, idempotency,
// and that deleting a user (the order services/accountDeletion.js uses) leaves global rows intact
// and no orphans.
//
//   TEST_DATABASE_URL=postgres://postgres:pw@localhost:5432/postgres npm test
//
// Skipped (not failed) without TEST_DATABASE_URL. The scratch database is created and dropped by the test.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Client, Pool } = require("pg");

const URL_ = process.env.TEST_DATABASE_URL;
const skip = !URL_ && "set TEST_DATABASE_URL to run the real-Postgres account tests";
const MIGRATION = fs.readFileSync(path.join(__dirname, "..", "..", "prisma", "migrations", "20261006000000_user_account_status", "migration.sql"), "utf8");

// Pre-migration shape of the tables involved (match_scores.profile_id is NO ACTION, as in production).
const BASELINE = `
CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'user');
CREATE TABLE companies (id SERIAL PRIMARY KEY, name TEXT);
CREATE TABLE jobs (id BIGSERIAL PRIMARY KEY, company_id INT REFERENCES companies(id), title TEXT,
  owner_user_id INT REFERENCES users(id) ON DELETE CASCADE, canonical_job_id BIGINT REFERENCES jobs(id));
CREATE TABLE user_profile (id SERIAL PRIMARY KEY, user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE match_scores (id BIGSERIAL PRIMARY KEY, job_id BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
  profile_id INT REFERENCES user_profile(id), method VARCHAR(20) NOT NULL DEFAULT 'x');
CREATE TABLE tracked_jobs (id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE, company TEXT);
`;

let admin, pool, dbName;
const q = (sql, p) => pool.query(sql, p);

test.before(async () => {
  if (skip) return;
  admin = new Client({ connectionString: URL_ });
  await admin.connect();
  dbName = `tt_accounts_${process.pid}_${Date.now()}`;
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

test("migration adds status/blocked_at/token_version with safe defaults, a CHECK, and is idempotent", { skip }, async () => {
  await q(`INSERT INTO users (email) VALUES ('old@x.co')`);
  await q(MIGRATION);
  await q(MIGRATION);
  const row = (await q(`SELECT status, blocked_at, token_version FROM users WHERE email='old@x.co'`)).rows[0];
  assert.deepEqual([row.status, row.blocked_at, row.token_version], ["ACTIVE", null, 0], "existing users become ACTIVE");
  await q(`UPDATE users SET status='BLOCKED', blocked_at=now() WHERE email='old@x.co'`);
  await assert.rejects(q(`UPDATE users SET status='SUSPENDED' WHERE email='old@x.co'`), /users_status_check/);
  await assert.rejects(q(`UPDATE users SET status=NULL WHERE email='old@x.co'`), /null value/);
  const fks = (await q(`SELECT c.conname, c.confdeltype FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype='f' AND c.conrelid='match_scores'::regclass AND c.confrelid='user_profile'::regclass AND a.attname='profile_id'`)).rows;
  assert.equal(fks.length, 1, "exactly one FK left on match_scores.profile_id (no duplicate after re-run)");
  assert.equal(fks[0].confdeltype, "c", "ON DELETE CASCADE");
});

test("deleting a user removes private data and match scores, keeps global jobs/companies, leaves no orphans", { skip }, async () => {
  const uid = (await q(`INSERT INTO users (email) VALUES ('a@x.co') RETURNING id`)).rows[0].id;
  const other = (await q(`INSERT INTO users (email) VALUES ('b@x.co') RETURNING id`)).rows[0].id;
  const co = (await q(`INSERT INTO companies (name) VALUES ('Acme') RETURNING id`)).rows[0].id;
  const gjob = (await q(`INSERT INTO jobs (company_id, title) VALUES ($1,'global') RETURNING id`, [co])).rows[0].id;
  const pjob = (await q(`INSERT INTO jobs (company_id, title, owner_user_id) VALUES ($1,'private',$2) RETURNING id`, [co, uid])).rows[0].id;
  const ojob = (await q(`INSERT INTO jobs (company_id, title, owner_user_id) VALUES ($1,'other-private',$2) RETURNING id`, [co, other])).rows[0].id;
  const prof = (await q(`INSERT INTO user_profile (user_id) VALUES ($1) RETURNING id`, [uid])).rows[0].id;
  const oprof = (await q(`INSERT INTO user_profile (user_id) VALUES ($1) RETURNING id`, [other])).rows[0].id;
  await q(`INSERT INTO match_scores (job_id, profile_id) VALUES ($1,$2),($3,$2),($1,$4)`, [gjob, prof, pjob, oprof]);
  await q(`INSERT INTO tracked_jobs (user_id, company) VALUES ($1,'x'),($2,'y')`, [uid, other]);
  // a global duplicate pointing at the user's private job (canonical_job_id is NO ACTION)
  const dup = (await q(`INSERT INTO jobs (company_id, title, canonical_job_id) VALUES ($1,'dup',$2) RETURNING id`, [co, pjob])).rows[0].id;

  // the same order services/accountDeletion.js uses, in one transaction
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`DELETE FROM match_scores WHERE profile_id IN (SELECT id FROM user_profile WHERE user_id=$1)`, [uid]);
    await c.query(`UPDATE jobs SET canonical_job_id=NULL WHERE canonical_job_id IN (SELECT id FROM jobs WHERE owner_user_id=$1) AND owner_user_id IS DISTINCT FROM $1`, [uid]);
    await c.query(`DELETE FROM jobs WHERE owner_user_id=$1`, [uid]);
    await c.query(`DELETE FROM users WHERE id=$1`, [uid]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }

  const count = async (sql, p) => Number((await q(sql, p)).rows[0].n);
  assert.equal(await count(`SELECT count(*) n FROM users WHERE id=$1`, [uid]), 0);
  assert.equal(await count(`SELECT count(*) n FROM tracked_jobs WHERE user_id=$1`, [uid]), 0);
  assert.equal(await count(`SELECT count(*) n FROM user_profile WHERE user_id=$1`, [uid]), 0);
  assert.equal(await count(`SELECT count(*) n FROM match_scores WHERE profile_id=$1`, [prof]), 0);
  assert.equal(await count(`SELECT count(*) n FROM jobs WHERE id=$1`, [pjob]), 0, "private job removed");
  assert.equal(await count(`SELECT count(*) n FROM jobs WHERE id=ANY($1)`, [[gjob, dup, ojob]]), 3, "global + other users' jobs stay");
  assert.equal((await q(`SELECT canonical_job_id FROM jobs WHERE id=$1`, [dup])).rows[0].canonical_job_id, null);
  assert.equal(await count(`SELECT count(*) n FROM companies`), 1, "global company stays");
  assert.equal(await count(`SELECT count(*) n FROM match_scores WHERE profile_id=$1`, [oprof]), 1, "other user's scores stay");
  assert.equal(await count(`SELECT count(*) n FROM tracked_jobs WHERE user_id=$1`, [other]), 1);
  // no orphans anywhere
  assert.equal(await count(`SELECT count(*) n FROM match_scores m LEFT JOIN user_profile p ON p.id=m.profile_id WHERE m.profile_id IS NOT NULL AND p.id IS NULL`), 0);
  assert.equal(await count(`SELECT count(*) n FROM jobs j LEFT JOIN users u ON u.id=j.owner_user_id WHERE j.owner_user_id IS NOT NULL AND u.id IS NULL`), 0);
});

test("with the migration applied, even a bare DELETE FROM users cascades through match_scores", { skip }, async () => {
  const uid = (await q(`INSERT INTO users (email) VALUES ('c@x.co') RETURNING id`)).rows[0].id;
  const prof = (await q(`INSERT INTO user_profile (user_id) VALUES ($1) RETURNING id`, [uid])).rows[0].id;
  const co = (await q(`SELECT id FROM companies LIMIT 1`)).rows[0].id;
  const gjob = (await q(`INSERT INTO jobs (company_id, title) VALUES ($1,'g2') RETURNING id`, [co])).rows[0].id;
  await q(`INSERT INTO match_scores (job_id, profile_id) VALUES ($1,$2)`, [gjob, prof]);
  await q(`DELETE FROM users WHERE id=$1`, [uid]);
  assert.equal(Number((await q(`SELECT count(*) n FROM match_scores WHERE profile_id=$1`, [prof])).rows[0].n), 0);
  assert.equal(Number((await q(`SELECT count(*) n FROM jobs WHERE id=$1`, [gjob])).rows[0].n), 1);
});
