-- Resume manager: which resume is "active" for tailoring. Purely additive and
-- idempotent. Existing rows keep NULL, which preserves the previous behaviour
-- (newest upload / profile text wins) until a user makes an explicit choice.
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "activated_at" TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS "idx_resumes_user_activated" ON "resumes" ("user_id", "activated_at" DESC);
