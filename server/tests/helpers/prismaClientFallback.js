// Preloaded by `npm test`. When `prisma generate` has not run (offline sandboxes), requiring
// @prisma/client fails with "Cannot find module '.prisma/client/default'" before any test can
// stub the data layer. Provide an inert stand-in ONLY in that case; with a generated client this
// file does nothing.
const Module = require("module");
let generated = true;
try { require.resolve(".prisma/client/default", { paths: [require.resolve("@prisma/client")] }); } catch { generated = false; }
if (!generated) {
  const origLoad = Module._load;
  class PrismaClientKnownRequestError extends Error { constructor(m, o = {}) { super(m); this.code = o.code; } }
  const stand = { PrismaClient: class { constructor() { return new Proxy({}, { get: () => { throw new Error("Prisma client not generated (test stand-in)"); } }); } }, Prisma: { PrismaClientKnownRequestError } };
  Module._load = function (request, ...rest) { return request === ".prisma/client/default" ? stand : origLoad.call(this, request, ...rest); };
}
