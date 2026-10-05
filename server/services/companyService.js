const { query } = require("../lib/prisma");
const { normalize } = require("./textUtils");

/**
 * Finds-or-creates the shared `companies` row for a name (one row per normalized name, so no
 * duplicate companies). The row itself is NOT private data - who may SEE a company is decided by
 * routes/companiesRoutes.js from the jobs the viewer can see, never by this table.
 */
async function ensureCompany(name) {
  const clean = String(name || "").trim().slice(0, 255);
  const normalized = normalize(clean).slice(0, 255);
  if (!normalized) return null;
  const { rows } = await query(
    `INSERT INTO companies (name, normalized_name) VALUES ($1, $2)
     ON CONFLICT (normalized_name) DO UPDATE SET name = companies.name
     RETURNING id`,
    [clean, normalized],
  );
  return rows[0]?.id ?? null;
}

module.exports = { ensureCompany };
