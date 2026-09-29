-- Mobile production readiness: refresh-token sessions, Expo push devices,
-- notification preferences and a send log (dedupe for reminders).
-- Purely additive and idempotent; no existing table is altered.

CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" INTEGER NOT NULL,
  "family_id" UUID NOT NULL,
  "refresh_token_hash" VARCHAR(64) NOT NULL,
  "device_name" VARCHAR(120),
  "platform" VARCHAR(20),
  "app_version" VARCHAR(40),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "rotated_at" TIMESTAMPTZ(6),
  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_sessions_refresh_token_hash_key" ON "user_sessions" ("refresh_token_hash");
CREATE INDEX IF NOT EXISTS "idx_user_sessions_user" ON "user_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_sessions_family" ON "user_sessions" ("family_id");

CREATE TABLE IF NOT EXISTS "push_devices" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "expo_push_token" VARCHAR(255) NOT NULL,
  "platform" VARCHAR(20),
  "device_name" VARCHAR(120),
  "app_version" VARCHAR(40),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disabled_at" TIMESTAMPTZ(6),
  CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "push_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "push_devices_expo_push_token_key" ON "push_devices" ("expo_push_token");
CREATE INDEX IF NOT EXISTS "idx_push_devices_user" ON "push_devices" ("user_id");

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "user_id" INTEGER NOT NULL,
  "push_enabled" BOOLEAN NOT NULL DEFAULT true,
  "interview_reminders" BOOLEAN NOT NULL DEFAULT true,
  "application_reminders" BOOLEAN NOT NULL DEFAULT true,
  "job_reminders" BOOLEAN NOT NULL DEFAULT true,
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
  "reminder_hour" INTEGER NOT NULL DEFAULT 9,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "notification_log" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "kind" VARCHAR(30) NOT NULL,
  "dedupe_key" VARCHAR(200) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "body" VARCHAR(500) NOT NULL,
  "data" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_notification_log_user_key" ON "notification_log" ("user_id", "dedupe_key");
CREATE INDEX IF NOT EXISTS "idx_notification_log_user_created" ON "notification_log" ("user_id", "created_at" DESC);
