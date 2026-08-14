const { PrismaClient } = require("@prisma/client");

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development"
      ? ["warn", "error"]
      : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Raw-SQL helper used by the analytics routes/service. Those files were
// previously doing `require("@prisma/client").query(...)`, but the
// `@prisma/client` package has no `query` export — that's what was
// throwing "query is not a function". Prisma's actual raw-query API is
// `prisma.$queryRawUnsafe(sql, ...params)`, which we wrap here so the
// rest of the codebase can keep the familiar `{ rows }` shape (same as
// the `pg` Pool API it was written against).
async function query(sql, params = []) {
  const rows = await prisma.$queryRawUnsafe(sql, ...params);
  return { rows };
}

module.exports = prisma;
module.exports.query = query;