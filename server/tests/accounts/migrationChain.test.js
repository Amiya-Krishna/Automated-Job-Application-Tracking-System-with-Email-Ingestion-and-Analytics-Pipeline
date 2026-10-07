// Builds an EMPTY Postgres database from prisma/migrations alone (twice, to prove idempotency) and
// checks the result against prisma/schema.prisma: every table, column, type and nullability, every
// named index/constraint, and the delete rules that account deletion relies on (every user-owned
// table cascades from users; the shared catalog keeps NO ACTION so it can never be cascaded away).
//
//   TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm test
//
// Skipped (not failed) without TEST_DATABASE_URL. The scratch database is created and dropped here.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const URL_ = process.env.TEST_DATABASE_URL;
const skip = !URL_ && "set TEST_DATABASE_URL to run the real-Postgres migration-chain test";
const ROOT = path.join(__dirname, "..", "..", "prisma");

const SCALAR = { Int: "integer", BigInt: "bigint", Boolean: "boolean", Json: "jsonb", Bytes: "bytea", Float: "double precision", Decimal: "numeric", String: "text", DateTime: "timestamp with time zone" };
const DB_ATTR = { Date: "date", Uuid: "uuid", VarChar: "character varying", Timestamptz: "timestamp with time zone", Text: "text" };

function parseSchema(src) {
  src = src.replace(/\/\/.*$/gm, "");
  const blocks = [...src.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
  const names = new Set(blocks.map((b) => b[1]));
  const models = {};
  for (const [, model, body] of blocks) {
    const table = (/@@map\("([^"]+)"\)/.exec(body) || [])[1] || model;
    const cols = {};
    for (const line of body.split("\n")) {
      const f = /^\s*(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/.exec(line);
      if (!f || line.trim().startsWith("@@") || names.has(f[2])) continue;
      const col = (/@map\("([^"]+)"\)/.exec(f[5]) || [])[1] || f[1];
      cols[col] = { type: f[2], array: Boolean(f[3]), optional: Boolean(f[4]), db: (/@db\.(\w+)/.exec(f[5]) || [])[1] };
    }
    models[table] = cols;
  }
  return { models, namedIndexes: [...src.matchAll(/map:\s*"([^"]+)"/g)].map((m) => m[1]) };
}

test("migrations build an empty database that matches schema.prisma, idempotently", { skip }, async () => {
  const admin = new Client({ connectionString: URL_ });
  await admin.connect();
  const dbName = `tt_chain_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE DATABASE ${dbName}`);
  const u = new URL(URL_); u.pathname = `/${dbName}`;
  const c = new Client({ connectionString: u.toString() });
  await c.connect();
  try {
    const migDir = path.join(ROOT, "migrations");
    const dirs = fs.readdirSync(migDir).filter((d) => fs.statSync(path.join(migDir, d)).isDirectory()).sort();
    assert.ok(dirs.length >= 9 && /baseline/.test(dirs[0]), "the chain starts with the baseline migration");
    for (let pass = 0; pass < 2; pass++) for (const d of dirs) await c.query(fs.readFileSync(path.join(migDir, d, "migration.sql"), "utf8"));

    const { models, namedIndexes } = parseSchema(fs.readFileSync(path.join(ROOT, "schema.prisma"), "utf8"));
    const problems = [];
    for (const [table, cols] of Object.entries(models)) {
      const { rows } = await c.query("select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name=$1", [table]);
      if (!rows.length) { problems.push(`missing table ${table}`); continue; }
      const have = Object.fromEntries(rows.map((r) => [r.column_name, r]));
      for (const [col, d] of Object.entries(cols)) {
        const h = have[col];
        if (!h) { problems.push(`missing column ${table}.${col}`); continue; }
        if (d.array) { if (h.data_type !== "ARRAY") problems.push(`${table}.${col} should be an array`); continue; }
        const want = DB_ATTR[d.db] || SCALAR[d.type];
        if (want && h.data_type !== want) problems.push(`${table}.${col}: want ${want}, got ${h.data_type}`);
        if ((h.is_nullable === "YES") !== d.optional) problems.push(`${table}.${col}: nullability differs (schema optional=${d.optional})`);
      }
      for (const col of Object.keys(have)) if (!cols[col]) problems.push(`extra column in database ${table}.${col}`);
    }
    for (const name of namedIndexes) {
      const { rows } = await c.query("select 1 from pg_indexes where schemaname='public' and indexname=$1 union select 1 from pg_constraint where conname=$1", [name]);
      if (!rows.length) problems.push(`missing index/constraint ${name}`);
    }
    assert.deepEqual(problems, []);

    // Delete rules: all user-owned data cascades from users; the shared catalog is NO ACTION.
    const { rows: fks } = await c.query(`select c.conrelid::regclass::text as tbl, a.attname as col, c.confdeltype as rule
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey) where c.contype = 'f'`);
    const rule = (tbl, col) => (fks.find((f) => f.tbl.replace(/"/g, "") === tbl && f.col === col) || {}).rule;
    for (const [tbl, col] of [["tracked_jobs", "user_id"], ["scrape_runs", "user_id"], ["user_profile", "user_id"], ["resumes", "user_id"], ["job_descriptions", "user_id"], ["resume_versions", "user_id"],
      ["tailoring_sessions", "user_id"], ["user_sessions", "user_id"], ["push_devices", "user_id"], ["notification_preferences", "user_id"], ["notification_log", "user_id"], ["notifications", "user_id"],
      ["jobs", "owner_user_id"], ["match_scores", "profile_id"]]) {
      assert.equal(rule(tbl, col), "c", `${tbl}.${col} must be ON DELETE CASCADE`);
    }
    for (const [tbl, col] of [["jobs", "company_id"], ["jobs", "source_id"], ["jobs", "canonical_job_id"]]) {
      assert.equal(rule(tbl, col), "a", `${tbl}.${col} (shared catalog) must stay NO ACTION`);
    }
  } finally {
    await c.end();
    await admin.query(`DROP DATABASE ${dbName}`);
    await admin.end();
  }
});
