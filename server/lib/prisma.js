const { PrismaClient } = require("@prisma/client");

// Prisma returns BigInt columns (jobs.id, applications.id, match_scores.id,
// jobs.canonical_job_id, etc — anything modeled as `BigInt` in schema.prisma
// to avoid precision loss) as native JS BigInt. Neither JSON.stringify nor
// BullMQ's job-data serialization (which also calls JSON.stringify under
// the hood, e.g. matchQueue.add({ jobId })) know how to handle that —
// you'll see "Do not know how to serialize a BigInt" the moment one of
// these ids reaches a res.json(...) call or a queue payload. IDs in this
// app never approach Number.MAX_SAFE_INTEGER (2^53), so converting to a
// plain number here — once, globally, for every file that requires this
// module — is safe and keeps every existing ===/template-literal usage of
// an id working exactly like a normal number.
if (typeof BigInt.prototype.toJSON !== "function") {
  BigInt.prototype.toJSON = function () {
    return Number(this);
  };
}

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