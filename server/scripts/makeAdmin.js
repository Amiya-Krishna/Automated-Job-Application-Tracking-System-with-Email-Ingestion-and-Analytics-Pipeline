// Usage:  npm run make-admin -- user@example.com          (promote)
//         npm run make-admin -- user@example.com --revoke  (back to "user")
require("../config/loadEnv").loadEnv();
const prisma = require("../lib/prisma");

(async () => {
  const email = (process.argv[2] || "").trim().toLowerCase();
  const revoke = process.argv.includes("--revoke");
  if (!email || email.startsWith("--")) {
    console.error("Usage: npm run make-admin -- <email> [--revoke]");
    process.exit(1);
  }
  const matches = await prisma.user.findMany({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, email: true } });
  if (!matches.length) {
    console.error(`No account with email ${email}. Register it first.`);
    process.exit(1);
  }
  // Emails are case-sensitive at registration, so "Boss@x.com" and "boss@x.com" can be two accounts.
  // Never guess which one is meant: require the exact spelling when it is ambiguous.
  const exact = matches.filter((m) => m.email === process.argv[2].trim());
  if (matches.length > 1 && exact.length !== 1) {
    console.error(`${matches.length} accounts match ${email} ignoring letter case (${matches.map((m) => m.email).join(", ")}). Re-run with the exact address.`);
    process.exit(1);
  }
  const user = matches.length === 1 ? matches[0] : exact[0];
  await prisma.user.update({ where: { id: user.id }, data: { role: revoke ? "user" : "admin" } });
  console.log(`${email} is now ${revoke ? "a regular user" : "an admin"}.`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
