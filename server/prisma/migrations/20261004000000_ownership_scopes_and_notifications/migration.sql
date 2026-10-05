-- Ownership model for jobs + per-user in-app notifications.
--
--   job_sources.scope   'global'  = fetched by an admin (linkedin, indeed, naukri, remotive,
--                                   internshala, wellfound, unstop) -> visible to every user
--                       'private' = created by a user (manual, gmail, extension)
--                                   -> visible only to its owner
--   jobs.owner_user_id  NULL for global jobs, the owning user's id for private jobs.
--                       A trigger keeps the two in sync so the invariant cannot be broken by a
--                       future code path: private source <=> owner set.
--
-- Idempotent (IF NOT EXISTS / guarded blocks) and backward compatible.

-- 1. Source scope ------------------------------------------------------------------------
ALTER TABLE "job_sources" ADD COLUMN IF NOT EXISTS "scope" VARCHAR(10) NOT NULL DEFAULT 'global';
UPDATE "job_sources" SET "scope" = 'private' WHERE "name" IN ('manual', 'gmail', 'extension');
UPDATE "job_sources" SET "scope" = 'global'  WHERE "name" IN ('linkedin', 'indeed', 'naukri', 'remotive', 'internshala', 'wellfound', 'unstop');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_sources_scope_check') THEN
    ALTER TABLE "job_sources" ADD CONSTRAINT "job_sources_scope_check" CHECK ("scope" IN ('global', 'private'));
  END IF;
END $$;

-- 2. Job owner ----------------------------------------------------------------------------
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "owner_user_id" INTEGER;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_owner_user_id_fkey') THEN
    ALTER TABLE "jobs" ADD CONSTRAINT "jobs_owner_user_id_fkey"
      FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_jobs_owner_user" ON "jobs" ("owner_user_id");

-- 3. Tracked jobs: remember the original site separately from the origin -----------------
-- tracked_jobs.source_name is the ORIGIN (manual | gmail | extension). The website a job was
-- captured on (linkedin, indeed, ...) now lives in `platform`.
ALTER TABLE "tracked_jobs" ADD COLUMN IF NOT EXISTS "platform" VARCHAR(50);
UPDATE "tracked_jobs"
   SET "platform" = lower("source_name"), "source_name" = 'extension'
 WHERE "engine_job_id" IS NULL
   AND lower("source_name") IN ('linkedin', 'indeed', 'naukri', 'internshala', 'wellfound', 'unstop', 'remotive');

-- 4. Backfill owners for existing private-source jobs -------------------------------------
-- Owner = the user whose tracked job points at the engine job (lowest user id if several).
UPDATE "jobs" j
   SET "owner_user_id" = t."user_id"
  FROM (SELECT "engine_job_id", MIN("user_id") AS "user_id" FROM "tracked_jobs" WHERE "engine_job_id" IS NOT NULL GROUP BY "engine_job_id") t
 WHERE t."engine_job_id" = j."id"
   AND j."owner_user_id" IS NULL
   AND j."source_id" IN (SELECT "id" FROM "job_sources" WHERE "scope" = 'private');

-- A tracked job that was merged into ANOTHER user's private job (cross-user duplicate) must
-- not keep pointing at it: clear the link; saving the job again re-bridges it privately.
UPDATE "tracked_jobs" tj
   SET "engine_job_id" = NULL
  FROM "jobs" j
 WHERE j."id" = tj."engine_job_id"
   AND j."owner_user_id" IS NOT NULL
   AND j."owner_user_id" <> tj."user_id";

-- Private-source rows nobody owns cannot be attributed to anyone: remove them (their
-- match_scores / applications cascade). Dependants are detached first.
UPDATE "jobs" SET "canonical_job_id" = NULL
 WHERE "canonical_job_id" IN (SELECT "id" FROM "jobs" WHERE "owner_user_id" IS NULL AND "source_id" IN (SELECT "id" FROM "job_sources" WHERE "scope" = 'private'));
DELETE FROM "jobs" WHERE "owner_user_id" IS NULL AND "source_id" IN (SELECT "id" FROM "job_sources" WHERE "scope" = 'private');

-- A private job may only duplicate a global job or one of the same owner.
UPDATE "jobs" j SET "canonical_job_id" = j."id", "status" = 'new'
  FROM "jobs" c
 WHERE j."canonical_job_id" = c."id" AND c."id" <> j."id"
   AND c."owner_user_id" IS NOT NULL AND c."owner_user_id" IS DISTINCT FROM j."owner_user_id";

-- 5. Uniqueness: external id is unique per (global) source, or per (owner, source) --------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'jobs' AND c.contype = 'u'
       AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) = ARRAY['external_job_id', 'source_id']
  LOOP
    EXECUTE format('ALTER TABLE "jobs" DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
DROP INDEX IF EXISTS "jobs_source_id_external_job_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "uq_jobs_global_source_external"
  ON "jobs" ("source_id", "external_job_id") WHERE "owner_user_id" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_jobs_private_owner_source_external"
  ON "jobs" ("owner_user_id", "source_id", "external_job_id") WHERE "owner_user_id" IS NOT NULL;

-- 6. Invariant: private source <=> owner set; a job may never be re-owned ------------------
CREATE OR REPLACE FUNCTION enforce_job_scope() RETURNS trigger AS $$
DECLARE src_scope TEXT;
BEGIN
  IF NEW.source_id IS NULL THEN
    IF NEW.owner_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'private jobs need a private source (job source missing)' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT scope INTO src_scope FROM job_sources WHERE id = NEW.source_id;
  IF src_scope = 'private' AND NEW.owner_user_id IS NULL THEN
    RAISE EXCEPTION 'jobs from a private source (manual/gmail/extension) must have an owner' USING ERRCODE = '23514';
  END IF;
  IF src_scope = 'global' AND NEW.owner_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'jobs from a global source must not be owned by a user' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id AND OLD.owner_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'a private job cannot change owner' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_jobs_enforce_scope ON "jobs";
CREATE TRIGGER trg_jobs_enforce_scope BEFORE INSERT OR UPDATE OF "source_id", "owner_user_id" ON "jobs"
  FOR EACH ROW EXECUTE FUNCTION enforce_job_scope();

-- 7. Per-user in-app notifications --------------------------------------------------------
CREATE TABLE IF NOT EXISTS "notifications" (
  "id"         SERIAL PRIMARY KEY,
  "user_id"    INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind"       VARCHAR(30) NOT NULL,
  "title"      VARCHAR(200) NOT NULL,
  "body"       VARCHAR(500) NOT NULL DEFAULT '',
  "target"     JSONB,
  "dedupe_key" VARCHAR(200),
  "read_at"    TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_notifications_user_created" ON "notifications" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_notifications_user_unread" ON "notifications" ("user_id") WHERE "read_at" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_notifications_user_dedupe" ON "notifications" ("user_id", "dedupe_key") WHERE "dedupe_key" IS NOT NULL;
