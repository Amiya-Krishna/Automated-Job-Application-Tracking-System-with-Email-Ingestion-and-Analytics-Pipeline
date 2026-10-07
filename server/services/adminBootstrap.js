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
    // Emails are stored exactly as typed and registration compares them case-sensitively, so
    // "Boss@x.com" and "boss@x.com" can be two different accounts. If a listed address matches more
    // than one account, promote NONE of them: otherwise anyone could register a case variant of an
    // administrator's address and be promoted at the next boot. (Use `npm run make-admin` to
    // promote a specific account in that situation.)
    const matches = await db.user.findMany({ where: { email: { in: emails, mode: "insensitive" } }, select: { id: true, email: true, role: true } });
    const byEmail = new Map();
    for (const u of matches) {
      const key = String(u.email).toLowerCase();
      byEmail.set(key, [...(byEmail.get(key) || []), u]);
    }
    const users = [];
    for (const [email, group] of byEmail) {
      if (group.length > 1) {
        log.error(`[admin-bootstrap] ${email} matches ${group.length} accounts differing only by letter case; none promoted`);
        continue;
      }
      if (group[0].role !== "admin") users.push(group[0]);
    }
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
