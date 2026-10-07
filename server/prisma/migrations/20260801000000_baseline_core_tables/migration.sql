-- Baseline: the core tables that existed before the first Prisma migration.
--
-- Why this exists: every later migration is written as an ALTER against these tables
-- (users, tracked_jobs, jobs, companies, job_sources, match_scores, user_profile,
-- applications, analytics_daily). Without a baseline, `prisma migrate deploy` could not build a
-- database from an empty one. This file makes the migration chain self-contained.
--
-- It describes the shape of those tables BEFORE migration 20260820000000, and nothing newer: columns
-- added later (users.role/status/blocked_at/token_version, jobs.owner_user_id/salary_text/skills,
-- job_sources.scope, tracked_jobs source/engine columns, user_profile.user_id, ...) are added by the
-- migrations that follow.
--
-- Safe on an existing database: every statement is CREATE ... IF NOT EXISTS, so on a database that
-- already has these tables (every deployed environment) it changes nothing.

CREATE TABLE IF NOT EXISTS "users" (
  "id"                  SERIAL PRIMARY KEY,
  "name"                VARCHAR(255) NOT NULL,
  "email"               VARCHAR(255) NOT NULL,
  "password"            VARCHAR(255) NOT NULL,
  "gmail_refresh_token" TEXT,
  "created_at"          TIMESTAMPTZ(6) DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users" ("email");

CREATE TABLE IF NOT EXISTS "tracked_jobs" (
  "id"               SERIAL PRIMARY KEY,
  "user_id"          INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "company"          VARCHAR(255) NOT NULL,
  "role"             VARCHAR(255) NOT NULL,
  "application_date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "status"           VARCHAR(50) DEFAULT 'Applied',
  "interview_date"   VARCHAR(50),
  "notes"            TEXT,
  "created_at"       TIMESTAMPTZ(6) DEFAULT now(),
  "updated_at"       TIMESTAMPTZ(6) DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_tracked_jobs_user_application_date" ON "tracked_jobs" ("user_id", "application_date" DESC);
CREATE INDEX IF NOT EXISTS "idx_tracked_jobs_user_id" ON "tracked_jobs" ("user_id");

CREATE TABLE IF NOT EXISTS "analytics_daily" (
  "day"               DATE PRIMARY KEY,
  "jobs_scraped"      INTEGER DEFAULT 0,
  "jobs_matched"      INTEGER DEFAULT 0,
  "applications_sent" INTEGER DEFAULT 0,
  "responses"         INTEGER DEFAULT 0,
  "response_rate_pct" DECIMAL(5,1),
  "refreshed_at"      TIMESTAMPTZ(6) DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "companies" (
  "id"              SERIAL PRIMARY KEY,
  "name"            VARCHAR(255) NOT NULL,
  "normalized_name" VARCHAR(255) NOT NULL,
  "domain"          VARCHAR(255),
  "created_at"      TIMESTAMPTZ(6) DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "companies_normalized_name_key" ON "companies" ("normalized_name");
CREATE INDEX IF NOT EXISTS "idx_companies_normalized" ON "companies" ("normalized_name");

CREATE TABLE IF NOT EXISTS "job_sources" (
  "id"         SERIAL PRIMARY KEY,
  "name"       VARCHAR(50) NOT NULL,
  "base_url"   VARCHAR(255),
  "created_at" TIMESTAMPTZ(6) DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "job_sources_name_key" ON "job_sources" ("name");

CREATE TABLE IF NOT EXISTS "jobs" (
  "id"               BIGSERIAL PRIMARY KEY,
  "company_id"       INTEGER REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "title"            VARCHAR(255) NOT NULL,
  "normalized_title" VARCHAR(255) NOT NULL,
  "description"      TEXT NOT NULL,
  "location"         VARCHAR(255),
  "remote_type"      VARCHAR(20),
  "source_id"        INTEGER REFERENCES "job_sources"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "source_url"       VARCHAR(1000) NOT NULL,
  "external_job_id"  VARCHAR(255),
  "canonical_job_id" BIGINT REFERENCES "jobs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "status"           VARCHAR(20) DEFAULT 'new',
  "posted_at"        TIMESTAMPTZ(6),
  "scraped_at"       TIMESTAMPTZ(6) DEFAULT now(),
  "content_hash"     VARCHAR(64) NOT NULL
);
-- Replaced by two partial unique indexes in migration 20261004000000. Create it only while that
-- migration has not run: if this file is ever replayed on a database that already has the partial
-- indexes (for example when it is applied after the later migrations), re-creating this full unique
-- index would stop two users from saving the same posting.
DO $$
BEGIN
  IF to_regclass('public.uq_jobs_global_source_external') IS NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "jobs_source_id_external_job_id_key" ON "jobs" ("source_id", "external_job_id");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_jobs_company_title" ON "jobs" ("company_id", "normalized_title");
CREATE INDEX IF NOT EXISTS "idx_jobs_content_hash" ON "jobs" ("content_hash");
CREATE INDEX IF NOT EXISTS "idx_jobs_posted_at" ON "jobs" ("posted_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_jobs_status" ON "jobs" ("status");

CREATE TABLE IF NOT EXISTS "applications" (
  "id"                 BIGSERIAL PRIMARY KEY,
  "job_id"             BIGINT REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "status"             VARCHAR(20) NOT NULL DEFAULT 'pending',
  "applied_at"         TIMESTAMPTZ(6),
  "failure_reason"     TEXT,
  "retry_count"        INTEGER DEFAULT 0,
  "playwright_log"     JSONB,
  "outcome_updated_at" TIMESTAMPTZ(6),
  "created_at"         TIMESTAMPTZ(6) DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "applications_job_id_key" ON "applications" ("job_id");
CREATE INDEX IF NOT EXISTS "idx_applications_applied_at" ON "applications" ("applied_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_applications_outcome_updated_at" ON "applications" ("outcome_updated_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_applications_status" ON "applications" ("status");

-- Originally ONE shared row for the whole system (the multi-user bug fixed by migration
-- 20260820000000, which adds user_profile.user_id).
CREATE TABLE IF NOT EXISTS "user_profile" (
  "id"               SERIAL PRIMARY KEY,
  "full_name"        VARCHAR(255),
  "email"            VARCHAR(255),
  "resume_text"      TEXT,
  "skills"           TEXT[] DEFAULT '{}',
  "experience_years" DECIMAL(3,1),
  "skill_weights"    JSONB DEFAULT '{}',
  "updated_at"       TIMESTAMPTZ(6) DEFAULT now()
);

-- profile_id is NO ACTION here; migration 20261006000000 makes it ON DELETE CASCADE.
-- (job_id, method) is widened to (job_id, profile_id, method) by migration 20260820000000.
CREATE TABLE IF NOT EXISTS "match_scores" (
  "id"         BIGSERIAL PRIMARY KEY,
  "job_id"     BIGINT REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "profile_id" INTEGER REFERENCES "user_profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "method"     VARCHAR(20) NOT NULL,
  "score"      DECIMAL(5,2) NOT NULL,
  "explanation" JSONB,
  "scored_at"  TIMESTAMPTZ(6) DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN ('match_scores_job_id_method_key', 'match_scores_job_id_profile_id_method_key')) THEN
    ALTER TABLE "match_scores" ADD CONSTRAINT "match_scores_job_id_method_key" UNIQUE ("job_id", "method");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_match_scores_score" ON "match_scores" ("score" DESC);
