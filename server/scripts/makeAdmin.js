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
  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (!user) {
    console.error(`No account with email ${email}. Register it first.`);
    process.exit(1);
  }
  await prisma.user.update({ where: { id: user.id }, data: { role: revoke ? "user" : "admin" } });
  console.log(`${email} is now ${revoke ? "a regular user" : "an admin"}.`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
