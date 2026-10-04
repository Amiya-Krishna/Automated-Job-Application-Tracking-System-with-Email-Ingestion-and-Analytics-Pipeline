// Promotes the accounts listed in ADMIN_EMAILS (comma separated) to the
// "admin" role. Runs at boot for accounts that ALREADY exist; it never
// creates accounts, never demotes anyone, and registration never grants a
// role (so nobody can claim an admin address by signing up first).
const prisma = require("../lib/prisma");

function parseAdminEmails(raw = process.env.ADMIN_EMAILS) {
  return String(raw || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

async function ensureAdmins(db = prisma, log = console) {
  const emails = parseAdminEmails();
  if (!emails.length) return { promoted: 0 };
  try {
    const users = await db.user.findMany({ where: { email: { in: emails, mode: "insensitive" }, NOT: { role: "admin" } }, select: { id: true } });
    if (!users.length) return { promoted: 0 };
    const r = await db.user.updateMany({ where: { id: { in: users.map((u) => u.id) } }, data: { role: "admin" } });
    log.log(`[admin-bootstrap] promoted ${r.count} account(s) from ADMIN_EMAILS`);
    return { promoted: r.count };
  } catch (e) {
    log.error(`[admin-bootstrap] skipped (${(e && (e.code || e.name)) || "error"}) - has \`prisma migrate deploy\` been run?`);
    return { promoted: 0 };
  }
}

module.exports = { ensureAdmins, parseAdminEmails };
