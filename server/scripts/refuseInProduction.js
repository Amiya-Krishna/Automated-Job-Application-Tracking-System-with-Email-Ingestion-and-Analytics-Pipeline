// `prisma migrate dev` can reset data and generates new migrations; it must
// never run against a production database. Production uses `prisma migrate deploy`.
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run `prisma migrate dev` with NODE_ENV=production. Use `npm run release` (prisma migrate deploy).");
  process.exit(1);
}
