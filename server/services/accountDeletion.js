// Permanent account deletion. The ONE implementation behind both
//   DELETE /api/auth/account          (a user deleting themselves), and
//   DELETE /api/admin/users/:id       (an admin deleting a normal user).
//
// What is deleted (everything the account owns privately):
//   tracked jobs (manual / Gmail / extension applications), private `jobs` rows (+ their
//   applications and match scores), scrape runs, the user profile and every match score computed
//   against it, resumes (+ facts, analyses, versions, changes), job descriptions, tailoring
//   sessions, login sessions (so every refresh token dies), push devices, notification
//   preferences / log / inbox.
// What is NEVER deleted: global, admin-fetched data (jobs with owner_user_id NULL, companies,
//   job_sources, global matches/applications). Those rows have no foreign key to the user, so the
//   only thing removed that touches them is the user's own relationship rows (tracked_jobs,
//   match scores of the user's profile).
//
// Everything runs in ONE transaction: either the account and all its private data are gone, or
// nothing changed. Most tables go via ON DELETE CASCADE from users (see prisma/schema.prisma); the
// explicit steps below cover the three places the database would otherwise refuse or leave debris:
//   1. match_scores of the user's profile (also CASCADE since migration 20261006000000; done here
//      too so the code stays correct on a database that has not been migrated yet),
//   2. a global job that names one of the user's private jobs as its canonical duplicate
//      (canonical_job_id is NO ACTION, so the pointer is cleared first),
//   3. the user's private jobs themselves.
const prisma = require("../lib/prisma");
const { ADMIN_ROLE } = require("../middleware/requireAdmin");
const { STATUS } = require("../lib/accountStatus");

class LastAdminError extends Error {
  constructor() {
    super("You are the last active administrator. Promote another administrator first.");
    this.name = "LastAdminError";
    this.code = "last_admin";
  }
}

async function runDeletion(tx, initial) {
  // Re-read inside the transaction: the role seen before it started may be stale (a concurrent
  // promotion would otherwise skip the last-administrator check).
  const user = (await tx.user.findUnique({ where: { id: initial.id }, select: { id: true, role: true } })) || initial;
  if (user.role === ADMIN_ROLE) {
    const otherAdmins = await tx.user.count({ where: { role: ADMIN_ROLE, status: STATUS.ACTIVE, NOT: { id: user.id } } });
    if (otherAdmins === 0) throw new LastAdminError();
  }

  const profile = await tx.user_profile.findUnique({ where: { user_id: user.id }, select: { id: true } });
  if (profile) await tx.match_scores.deleteMany({ where: { profile_id: profile.id } });

  const owned = await tx.jobs.findMany({ where: { owner_user_id: user.id }, select: { id: true } });
  const ownedIds = owned.map((j) => j.id);
  if (ownedIds.length) {
    await tx.jobs.updateMany({ where: { canonical_job_id: { in: ownedIds }, OR: [{ owner_user_id: null }, { owner_user_id: { not: user.id } }] }, data: { canonical_job_id: null } });
    await tx.jobs.deleteMany({ where: { owner_user_id: user.id } });
  }

  // Cascades: tracked jobs, scrape runs, profile, resumes (+facts/analyses/versions/changes),
  // job descriptions, tailoring sessions, login sessions, push devices, notification rows.
  await tx.user.delete({ where: { id: user.id } });
  return { privateJobsDeleted: ownedIds.length };
}

// Best effort: tell Google to drop the Gmail grant. Never blocks or fails the deletion (the user
// row, and with it our copy of the token, is already gone).
async function revokeGmailGrant(refreshToken) {
  if (!refreshToken) return;
  try {
    const { getOAuthClient } = require("../config/google");
    await getOAuthClient().revokeToken(refreshToken);
  } catch (e) {
    console.error("Gmail revoke during account deletion failed");
  }
}

// Returns { deleted: true, privateJobsDeleted } or { deleted: false } when the account is already
// gone. Throws LastAdminError when asked to delete the last active administrator.
async function deleteUserAccount(userId, { db = prisma } = {}) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, gmailRefreshToken: true } });
  if (!user) return { deleted: false };

  const attempt = () => db.$transaction((tx) => runDeletion(tx, user), user.role === ADMIN_ROLE ? { isolationLevel: "Serializable" } : undefined);

  let result;
  try {
    result = await attempt();
  } catch (err) {
    // A background worker can insert a match score for the profile between our delete of the scores
    // and of the profile (P2003 foreign-key violation) or Serializable can abort (P2034). One retry.
    if (err && (err.code === "P2003" || err.code === "P2034")) result = await attempt();
    else if (err && err.code === "P2025") return { deleted: false }; // deleted concurrently
    else throw err;
  }
  await revokeGmailGrant(user.gmailRefreshToken);
  return { deleted: true, ...result };
}

module.exports = { deleteUserAccount, LastAdminError };
