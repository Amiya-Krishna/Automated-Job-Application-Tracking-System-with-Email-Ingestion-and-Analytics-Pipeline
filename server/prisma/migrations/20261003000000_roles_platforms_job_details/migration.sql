-- User/Admin roles + structured job details (salary/stipend, skills).
-- Purely additive and idempotent: every new column is nullable or has a
-- default, so existing rows and older app versions keep working. Existing
-- users become "user"; promote admins with `npm run make-admin -- <email>`
-- or the ADMIN_EMAILS environment variable (see docs).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" VARCHAR(20) NOT NULL DEFAULT 'user';

ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "salary_text" VARCHAR(255);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "tracked_jobs" ADD COLUMN IF NOT EXISTS "salary_text" VARCHAR(255);
ALTER TABLE "tracked_jobs" ADD COLUMN IF NOT EXISTS "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
