// Boot-time diagnostics for the two deployment mistakes that turn every
// mobile/extension/web login into an opaque HTTP 500:
//   1. the Prisma client was generated from an older schema (no `userSession`);
//   2. `prisma migrate deploy` was never run, so table `user_sessions` is missing.
// Never throws and never blocks startup; it only logs an actionable message.
const prisma = require("./prisma");

async function warnIfSessionsTableMissing(db = prisma, log = console) {
  try {
    if (!db.userSession) {
      log.error(
        "[schema-check] Prisma client has no UserSession model. Run `npx prisma generate` in server/ as part of the build step, then redeploy.",
      );
      return false;
    }
    const rows = await db.$queryRaw`SELECT to_regclass('public.user_sessions')::text AS t`;
    if (!rows || !rows[0] || !rows[0].t) {
      log.error(
        "[schema-check] Table user_sessions does not exist, so login for the extension, mobile and web apps will fail with HTTP 500. Run `npx prisma migrate deploy` against the production DATABASE_URL (see docs/05_Deployment_and_Operations.md).",
      );
      return false;
    }
    return true;
  } catch (e) {
    log.error(`[schema-check] could not verify user_sessions (${e && (e.code || e.name)})`);
    return false;
  }
}

// Migration 20261006000000 adds users.status / token_version. Without it every authenticated
// request would fail (the auth middleware reads them), so say so loudly at boot.
async function warnIfAccountStatusMissing(db = prisma, log = console) {
  try {
    const rows = await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN ('status', 'token_version')`;
    if (!rows || rows.length < 2) {
      log.error(
        "[schema-check] users.status / users.token_version are missing, so every authenticated request will fail with HTTP 500. Run `npx prisma migrate deploy` (migration 20261006000000_user_account_status) and `npx prisma generate`.",
      );
      return false;
    }
    return true;
  } catch (e) {
    log.error(`[schema-check] could not verify users.status (${e && (e.code || e.name)})`);
    return false;
  }
}

module.exports = { warnIfSessionsTableMissing, warnIfAccountStatusMissing };
