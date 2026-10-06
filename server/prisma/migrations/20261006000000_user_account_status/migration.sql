-- User account status (ACTIVE | BLOCKED), token versioning and account-deletion integrity.
--
--   * users.status         'ACTIVE' (default) | 'BLOCKED'. Existing users all become ACTIVE.
--                          Enforced by a CHECK constraint (Prisma cannot model it; the column is a
--                          VARCHAR like `role`, matching the project's existing conventions).
--   * users.blocked_at     when the current block was applied (NULL while ACTIVE).
--   * users.token_version  embedded in access tokens as `tv`; bumped when an admin blocks an
--                          account so every previously issued token stays invalid, even after an
--                          unblock.
--   * match_scores.profile_id -> user_profile(id) becomes ON DELETE CASCADE. It used to be
--                          NO ACTION, so deleting a user who had a profile that was ever scored
--                          failed with a foreign-key error. Scores of a deleted profile are that
--                          user's private data and are removed with it; the scored (global) jobs
--                          themselves are untouched.
--
-- Purely additive and idempotent (safe to re-run). Deploy with `prisma migrate deploy`.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "blocked_at" TIMESTAMPTZ(6);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "token_version" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_status_check') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_status_check" CHECK ("status" IN ('ACTIVE', 'BLOCKED'));
  END IF;
END $$;

-- match_scores.profile_id: replace whatever FK exists (its name came from the pre-migration
-- baseline) with an ON DELETE CASCADE one. Skipped when it is already CASCADE.
DO $$
DECLARE
  fk RECORD;
  already_cascade BOOLEAN := FALSE;
BEGIN
  IF to_regclass('public.match_scores') IS NULL OR to_regclass('public.user_profile') IS NULL THEN
    RETURN;
  END IF;

  FOR fk IN
    SELECT c.conname, c.confdeltype
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f'
       AND c.conrelid = 'public.match_scores'::regclass
       AND c.confrelid = 'public.user_profile'::regclass
       AND a.attname = 'profile_id'
  LOOP
    IF fk.confdeltype = 'c' THEN
      already_cascade := TRUE;
    ELSE
      EXECUTE format('ALTER TABLE "match_scores" DROP CONSTRAINT %I', fk.conname);
    END IF;
  END LOOP;

  IF NOT already_cascade THEN
    ALTER TABLE "match_scores"
      ADD CONSTRAINT "match_scores_profile_id_fkey"
      FOREIGN KEY ("profile_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
