-- AI Resume Tailoring: purely additive. No existing table/column is altered
-- or dropped. Idempotent (IF NOT EXISTS) in the same style as the earlier
-- migrations in this repo.
--
-- Apply with:  npx prisma migrate deploy
-- (or, if you created these tables by hand:
--   npx prisma migrate resolve --applied 20260919000000_resume_tailoring)

CREATE TABLE IF NOT EXISTS "resumes" (
  "id"             SERIAL PRIMARY KEY,
  "user_id"        INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source_type"    VARCHAR(20) NOT NULL,
  "label"          VARCHAR(120) NOT NULL DEFAULT 'Original',
  "file_name"      VARCHAR(255),
  "mime_type"      VARCHAR(100),
  "file_size"      INTEGER,
  "file_sha256"    VARCHAR(64),
  "file_data"      BYTEA,
  "raw_text"       TEXT NOT NULL,
  "text_hash"      VARCHAR(64) NOT NULL,
  "parsed"         JSONB,
  "parser_version" VARCHAR(20),
  "parse_quality"  JSONB,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_resumes_user_text_hash" ON "resumes" ("user_id", "text_hash");
CREATE INDEX IF NOT EXISTS "idx_resumes_user_created" ON "resumes" ("user_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "resume_facts" (
  "id"          SERIAL PRIMARY KEY,
  "resume_id"   INTEGER NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
  "fact_key"    VARCHAR(20) NOT NULL,
  "unit_id"     VARCHAR(40) NOT NULL,
  "kind"        VARCHAR(30) NOT NULL,
  "section"     VARCHAR(30) NOT NULL,
  "text"        TEXT NOT NULL,
  "source_path" VARCHAR(120) NOT NULL,
  "entry_id"    VARCHAR(40),
  "confidence"  DOUBLE PRECISION NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_resume_facts_resume_key" ON "resume_facts" ("resume_id", "fact_key");
CREATE INDEX IF NOT EXISTS "idx_resume_facts_resume" ON "resume_facts" ("resume_id");

CREATE TABLE IF NOT EXISTS "job_descriptions" (
  "id"               SERIAL PRIMARY KEY,
  "user_id"          INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "jd_hash"          VARCHAR(64) NOT NULL,
  "job_key"          VARCHAR(60),
  "title"            VARCHAR(255) NOT NULL,
  "company"          VARCHAR(255) NOT NULL,
  "location"         VARCHAR(255),
  "source_url"       VARCHAR(1000),
  "source_name"      VARCHAR(50),
  "raw_text"         TEXT NOT NULL,
  "parsed"           JSONB NOT NULL,
  "taxonomy_version" VARCHAR(20) NOT NULL,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_job_descriptions_user_hash" ON "job_descriptions" ("user_id", "jd_hash");

CREATE TABLE IF NOT EXISTS "resume_analyses" (
  "id"                 SERIAL PRIMARY KEY,
  "user_id"            INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "resume_id"          INTEGER NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
  "jd_id"              INTEGER NOT NULL REFERENCES "job_descriptions"("id") ON DELETE CASCADE,
  "job_key"            VARCHAR(60) NOT NULL,
  "taxonomy_version"   VARCHAR(20) NOT NULL,
  "match_score"        INTEGER,
  "matched_skills"     TEXT[] NOT NULL DEFAULT '{}',
  "partial_skills"     TEXT[] NOT NULL DEFAULT '{}',
  "missing_skills"     TEXT[] NOT NULL DEFAULT '{}',
  "unsupported_claims" JSONB NOT NULL DEFAULT '[]',
  "recommendations"    JSONB NOT NULL DEFAULT '[]',
  "result"             JSONB NOT NULL,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_resume_analyses_resume_jd_tax" ON "resume_analyses" ("resume_id", "jd_id", "taxonomy_version");
CREATE INDEX IF NOT EXISTS "idx_resume_analyses_user_job" ON "resume_analyses" ("user_id", "job_key", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "resume_versions" (
  "id"                 SERIAL PRIMARY KEY,
  "user_id"            INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "resume_id"          INTEGER NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
  "jd_id"              INTEGER NOT NULL REFERENCES "job_descriptions"("id") ON DELETE CASCADE,
  "job_key"            VARCHAR(60) NOT NULL,
  "tracked_job_id"     INTEGER,
  "jd_hash"            VARCHAR(64) NOT NULL,
  "label"              VARCHAR(255) NOT NULL,
  "target_company"     VARCHAR(255) NOT NULL,
  "target_title"       VARCHAR(255) NOT NULL,
  "status"             VARCHAR(20) NOT NULL DEFAULT 'draft',
  "profile"            JSONB NOT NULL,
  "match_score"        INTEGER,
  "analysis"           JSONB NOT NULL,
  "snapshot"           JSONB NOT NULL,
  "unsupported_claims" JSONB NOT NULL DEFAULT '[]',
  "recommendations"    JSONB NOT NULL DEFAULT '[]',
  "warnings"           JSONB NOT NULL DEFAULT '[]',
  "ai_provider"        VARCHAR(30),
  "ai_model"           VARCHAR(80),
  "ai_used"            BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "approved_at"        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "idx_resume_versions_user_created" ON "resume_versions" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_resume_versions_user_job" ON "resume_versions" ("user_id", "job_key");

CREATE TABLE IF NOT EXISTS "resume_changes" (
  "id"            SERIAL PRIMARY KEY,
  "version_id"    INTEGER NOT NULL REFERENCES "resume_versions"("id") ON DELETE CASCADE,
  "change_key"    VARCHAR(20) NOT NULL,
  "position"      INTEGER NOT NULL DEFAULT 0,
  "section"       VARCHAR(30) NOT NULL,
  "op"            VARCHAR(20) NOT NULL,
  "list_path"     VARCHAR(40),
  "unit_id"       VARCHAR(40),
  "original_text" TEXT NOT NULL,
  "proposed_text" TEXT NOT NULL,
  "before_ids"    JSONB,
  "after_ids"     JSONB,
  "reason"        TEXT NOT NULL,
  "evidence_ids"  TEXT[] NOT NULL DEFAULT '{}',
  "source"        VARCHAR(20) NOT NULL,
  "status"        VARCHAR(20) NOT NULL DEFAULT 'pending',
  "validation"    JSONB NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_resume_changes_version_key" ON "resume_changes" ("version_id", "change_key");
CREATE INDEX IF NOT EXISTS "idx_resume_changes_version" ON "resume_changes" ("version_id", "position");

CREATE TABLE IF NOT EXISTS "tailoring_sessions" (
  "id"          VARCHAR(36) PRIMARY KEY,
  "user_id"     INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "resume_id"   INTEGER,
  "job_key"     VARCHAR(60) NOT NULL,
  "status"      VARCHAR(20) NOT NULL DEFAULT 'queued',
  "stage"       VARCHAR(30) NOT NULL DEFAULT 'queued',
  "version_id"  INTEGER,
  "error"       TEXT,
  "error_code"  VARCHAR(40),
  "warnings"    JSONB NOT NULL DEFAULT '[]',
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "finished_at" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "idx_tailoring_sessions_user" ON "tailoring_sessions" ("user_id", "created_at" DESC);
