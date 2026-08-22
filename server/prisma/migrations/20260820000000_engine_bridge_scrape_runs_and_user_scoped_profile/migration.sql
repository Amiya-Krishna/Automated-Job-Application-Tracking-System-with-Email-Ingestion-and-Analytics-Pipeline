-- Consolidated migration for everything schema.prisma now describes beyond
-- the original baseline (tracked_jobs source-attribution fields, the
-- scrape_runs table, and the multi-user profile/match_scores fix).
--
-- This has NOT been applied against a live database from this sandbox —
-- outbound network access to binaries.prisma.sh (required for
-- `prisma migrate dev`/`generate` to fetch the query/schema engine) is
-- blocked here (403 Forbidden), and no Postgres instance is reachable
-- either. This file was authored by hand to match schema.prisma exactly
-- and uses IF NOT EXISTS / guarded DO blocks throughout so it is safe to
-- run against a database that already has some of these changes applied
-- (e.g. if a previous session partially migrated). Review it against your
-- actual database before running, then apply with:
--
--   npx prisma migrate resolve --applied 20260820000000_engine_bridge_scrape_runs_and_user_scoped_profile
--   (if you already applied equivalent DDL by hand), OR
--   npx prisma migrate deploy
--   (against a fresh/matching database)
--
-- No existing data is dropped or destructively altered by this file.

-- ============================================================
-- 1. tracked_jobs: source-attribution + engine-bridge columns
-- ============================================================
ALTER TABLE "tracked_jobs"
  ADD COLUMN IF NOT EXISTS "source_name"      VARCHAR(50) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "source_url"        VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS "external_job_id"   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "description"       TEXT,
  ADD COLUMN IF NOT EXISTS "location"          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "engine_job_id"     BIGINT;

-- ============================================================
-- 2. scrape_runs: dashboard-triggered discovery run tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS "scrape_runs" (
  "id"               SERIAL PRIMARY KEY,
  "user_id"          INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "query"            VARCHAR(255) NOT NULL,
  "location"         VARCHAR(255),
  "sources"          TEXT[] NOT NULL DEFAULT '{}',
  "limit_per_source" INTEGER NOT NULL DEFAULT 25,
  "status"           VARCHAR(20) NOT NULL DEFAULT 'queued',
  "bull_job_id"       VARCHAR(100),
  "results"          JSONB DEFAULT '{}',
  "started_at"       TIMESTAMPTZ,
  "finished_at"      TIMESTAMPTZ,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_scrape_runs_user_created"
  ON "scrape_runs" ("user_id", "created_at" DESC);

-- ============================================================
-- 3. user_profile: add owning user (fixes shared-singleton-profile bug)
-- ============================================================
ALTER TABLE "user_profile"
  ADD COLUMN IF NOT EXISTS "user_id" INTEGER;

-- Unique + FK added in a guarded block so re-running this file is safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profile_user_id_key'
  ) THEN
    ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_key" UNIQUE ("user_id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profile_user_id_fkey'
  ) THEN
    ALTER TABLE "user_profile"
      ADD CONSTRAINT "user_profile_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_user_profile_user_id" ON "user_profile" ("user_id");

-- NOTE: if a pre-existing singleton user_profile row already exists in
-- your database, it is NOT deleted or auto-assigned to a user by this
-- migration — that would be a guess about who it belongs to. It becomes
-- an orphaned row (user_id IS NULL) that the app no longer reads/writes.
-- Manually reassign it to the correct user (`UPDATE user_profile SET
-- user_id = <id> WHERE id = <old row id>`) if you know who it was, or
-- leave it — new per-user profiles are created automatically on first
-- save via POST /api/profile.

-- ============================================================
-- 4. match_scores: widen uniqueness so per-user profiles can each
--    have their own score for the same job
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'match_scores_job_id_method_key'
  ) THEN
    ALTER TABLE "match_scores" DROP CONSTRAINT "match_scores_job_id_method_key";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'match_scores_job_id_profile_id_method_key'
  ) THEN
    ALTER TABLE "match_scores"
      ADD CONSTRAINT "match_scores_job_id_profile_id_method_key"
      UNIQUE ("job_id", "profile_id", "method");
  END IF;
END $$;
