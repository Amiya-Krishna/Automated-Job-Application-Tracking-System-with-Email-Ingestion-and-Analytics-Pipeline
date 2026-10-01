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

module.exports = { warnIfSessionsTableMissing };
