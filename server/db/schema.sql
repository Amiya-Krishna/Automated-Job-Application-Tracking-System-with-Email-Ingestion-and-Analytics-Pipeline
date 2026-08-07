-- Job Application Tracker Portal — full PostgreSQL schema
-- Run with: psql "$PG_CONNECTION_STRING" -f db/schema.sql
-- or:       npm run db:migrate   (uses PG_CONNECTION_STRING from .env)

-- --- Auth / tracker (previously MongoDB/Mongoose) ---

CREATE TABLE IF NOT EXISTS users (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(255) NOT NULL,
    email               VARCHAR(255) NOT NULL UNIQUE,
    password            VARCHAR(255) NOT NULL,
    gmail_refresh_token TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracked_jobs (
    id                SERIAL PRIMARY KEY,
    user_id           INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company           VARCHAR(255) NOT NULL,
    role              VARCHAR(255) NOT NULL,
    application_date  DATE,
    status            VARCHAR(50) DEFAULT 'Applied',
    interview_date    VARCHAR(50),
    notes             TEXT,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tracked_jobs_user_id ON tracked_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_tracked_jobs_user_application_date ON tracked_jobs(user_id, application_date DESC);
CREATE INDEX IF NOT EXISTS idx_tracked_jobs_user_company_role_norm ON tracked_jobs (
    user_id,
    lower(btrim(company)),
    lower(btrim(role))
);
CREATE INDEX IF NOT EXISTS idx_tracked_jobs_user_company_role_date_norm ON tracked_jobs (
    user_id,
    application_date,
    lower(btrim(company)),
    lower(btrim(role))
);

ALTER TABLE tracked_jobs ADD COLUMN IF NOT EXISTS application_date DATE;
UPDATE tracked_jobs
SET application_date = COALESCE(application_date, created_at::date)
WHERE application_date IS NULL;
ALTER TABLE tracked_jobs ALTER COLUMN application_date SET DEFAULT CURRENT_DATE;
ALTER TABLE tracked_jobs ALTER COLUMN application_date SET NOT NULL;

-- --- Intelligent Job Application Engine ---

CREATE TABLE IF NOT EXISTS job_sources (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(50) UNIQUE NOT NULL,
    base_url        VARCHAR(255),
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL UNIQUE,
    domain          VARCHAR(255),
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_companies_normalized ON companies(normalized_name);

CREATE TABLE IF NOT EXISTS jobs (
    id                BIGSERIAL PRIMARY KEY,
    company_id        INT REFERENCES companies(id) ON DELETE SET NULL,
    title             VARCHAR(255) NOT NULL,
    normalized_title  VARCHAR(255) NOT NULL,
    description       TEXT NOT NULL,
    location          VARCHAR(255),
    remote_type       VARCHAR(20),
    source_id         INT REFERENCES job_sources(id),
    source_url        VARCHAR(1000) NOT NULL,
    external_job_id   VARCHAR(255),
    canonical_job_id  BIGINT REFERENCES jobs(id),
    status            VARCHAR(20) DEFAULT 'new',
    posted_at         TIMESTAMPTZ,
    scraped_at        TIMESTAMPTZ DEFAULT now(),
    content_hash      VARCHAR(64) NOT NULL,
    UNIQUE (source_id, external_job_id)
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_content_hash ON jobs(content_hash);
CREATE INDEX IF NOT EXISTS idx_jobs_company_title ON jobs(company_id, normalized_title);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_at ON jobs(posted_at DESC);

CREATE TABLE IF NOT EXISTS user_profile (
    id                SERIAL PRIMARY KEY,
    full_name         VARCHAR(255),
    email             VARCHAR(255),
    resume_text       TEXT,
    skills            TEXT[] DEFAULT '{}',
    experience_years  NUMERIC(3,1),
    skill_weights     JSONB DEFAULT '{}',
    updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_scores (
    id            BIGSERIAL PRIMARY KEY,
    job_id        BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
    profile_id    INT REFERENCES user_profile(id),
    method        VARCHAR(20) NOT NULL,
    score         NUMERIC(5,2) NOT NULL,
    explanation   JSONB,
    scored_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE (job_id, method)
);
CREATE INDEX IF NOT EXISTS idx_match_scores_score ON match_scores(score DESC);

CREATE TABLE IF NOT EXISTS applications (
    id                  BIGSERIAL PRIMARY KEY,
    job_id              BIGINT REFERENCES jobs(id) ON DELETE CASCADE UNIQUE,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',
    applied_at          TIMESTAMPTZ,
    failure_reason      TEXT,
    retry_count         INT DEFAULT 0,
    playwright_log      JSONB,
    outcome_updated_at  TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_applied_at ON applications(applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_outcome_updated_at ON applications(outcome_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_status_applied_at ON applications(status, applied_at DESC) WHERE applied_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS analytics_daily (
    day                     DATE PRIMARY KEY,
    jobs_scraped            INT DEFAULT 0,
    jobs_matched            INT DEFAULT 0,
    applications_sent       INT DEFAULT 0,
    responses                INT DEFAULT 0,
    response_rate_pct        NUMERIC(5,1),
    refreshed_at            TIMESTAMPTZ DEFAULT now()
);

INSERT INTO job_sources (name, base_url) VALUES
  ('linkedin', 'https://www.linkedin.com'),
  ('indeed', 'https://www.indeed.com')
ON CONFLICT (name) DO NOTHING;
