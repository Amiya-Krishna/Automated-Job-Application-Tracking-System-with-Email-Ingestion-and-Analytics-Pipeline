// Single source of truth for WHO MAY SEE WHICH JOB / COMPANY / SOURCE.
//
//   GLOBAL jobs   fetched by an admin from LINKEDIN, NAUKRI, REMOTIVE, UNSTOP, INDEED,
//                 WELLFOUND or INTERNSHALA. owner_user_id IS NULL. Visible to everyone.
//   PRIVATE jobs  created by a user through MANUAL entry, GMAIL import or the browser
//                 EXTENSION. owner_user_id = that user. Visible to that user only.
//
// Every query over the shared `jobs` table must filter with visibleJobsWhere(userId) (Prisma) or
// VISIBLE_JOB_SQL (raw SQL). The database also enforces "private source <=> owner set" with a
// trigger (migration 20261004000000), so a new code path cannot silently create an ownerless
// private job or an owned global one.
//
// Nothing here ever looks at the user's role: an admin sees exactly what any user sees (global
// jobs + their OWN private jobs). Admin screens for global data filter on owner_user_id IS NULL.

const GLOBAL_SOURCES = Object.freeze(["linkedin", "naukri", "remotive", "unstop", "indeed", "wellfound", "internshala"]);
const PRIVATE_SOURCES = Object.freeze(["manual", "gmail", "extension"]);

const isPrivateSource = (name) => PRIVATE_SOURCES.includes(String(name || "").toLowerCase());
const isGlobalSource = (name) => GLOBAL_SOURCES.includes(String(name || "").toLowerCase());

/** Prisma `where` fragment: global jobs OR jobs owned by this user. */
function visibleJobsWhere(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) throw new Error("visibleJobsWhere: a valid user id is required");
  return { OR: [{ owner_user_id: null }, { owner_user_id: id }] };
}

/** Prisma `where` fragment: only global (admin-fetched) jobs. */
const globalJobsWhere = () => ({ owner_user_id: null });

/** Raw SQL fragment (alias `j`), parameter placeholder supplied by the caller: `$n`. */
const visibleJobSql = (alias, placeholder) => `(${alias}.owner_user_id IS NULL OR ${alias}.owner_user_id = ${placeholder})`;

/**
 * Maps whatever a client sent as "source" to the ORIGIN a user-created job is allowed to have.
 * A client may only ever create manual / gmail / extension jobs. A website name sent by the
 * extension (linkedin, indeed, ...) is the PLATFORM the job was captured on, not a global
 * source: it becomes { origin: "extension", platform }.
 */
function normalizeOrigin(sourceName, platform) {
  const s = String(sourceName || "").trim().toLowerCase();
  const p = String(platform || "").trim().toLowerCase().slice(0, 50) || null;
  if (s === "gmail") return { origin: "gmail", platform: null };
  if (s === "manual" || s === "") return { origin: "manual", platform: null };
  if (s === "extension") return { origin: "extension", platform: p && isGlobalSource(p) ? p : null };
  if (isGlobalSource(s)) return { origin: "extension", platform: s };
  return { origin: "manual", platform: null };
}

module.exports = { GLOBAL_SOURCES, PRIVATE_SOURCES, isPrivateSource, isGlobalSource, visibleJobsWhere, globalJobsWhere, visibleJobSql, normalizeOrigin };
