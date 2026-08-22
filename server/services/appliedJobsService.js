// Normalizes "applied jobs" into one shape for the client, without
// blindly UNIONing incompatible tables.
//
// TrackedJob already IS the unified per-user record for manual, extension,
// and Gmail sources (see jobRoutes.js / gmailRoutes.js — all three write
// into tracked_jobs, distinguished by source_name). The one genuinely
// separate table is `applications`, the automated apply-engine's own
// record — it has no user_id (it's keyed 1:1 to a `jobs` row, not to a
// person; see the multi-user audit notes in server.js) — so it cannot be
// safely queried "by user" on its own. Instead, for each user we only
// look up an `applications` row when it's tied to a `jobs` row THIS
// user's own TrackedJob.engine_job_id points to. That keeps the join
// correctly scoped to data the user actually owns, and folds the engine
// application's status into the same row as the tracked job — one row
// per job, never a duplicate.
const prisma = require("../lib/prisma");

async function getAppliedJobsForUser(userId) {
  const trackedJobs = await prisma.trackedJob.findMany({
    where: { userId },
    orderBy: { applicationDate: "desc" },
  });

  const engineJobIds = trackedJobs
    .map((t) => t.engineJobId)
    .filter((id) => id !== null && id !== undefined);

  const [profile, scores, applications] = await Promise.all([
    prisma.user_profile.findUnique({ where: { user_id: userId } }),
    engineJobIds.length
      ? prisma.match_scores.findMany({
          where: { job_id: { in: engineJobIds }, method: "tfidf" },
        })
      : Promise.resolve([]),
    engineJobIds.length
      ? prisma.applications.findMany({
          where: { job_id: { in: engineJobIds } },
        })
      : Promise.resolve([]),
  ]);

  const scoreByJobId = new Map();
  if (profile) {
    for (const s of scores) {
      if (s.profile_id === profile.id) {
        scoreByJobId.set(String(s.job_id), Number(s.score));
      }
    }
  }

  const applicationByJobId = new Map(
    applications.map((a) => [String(a.job_id), a]),
  );

  return trackedJobs.map((t) => {
    const engineJobIdStr = t.engineJobId ? String(t.engineJobId) : null;
    const engineApplication = engineJobIdStr
      ? applicationByJobId.get(engineJobIdStr)
      : undefined;

    return {
      id: `tracked-${t.id}`,
      trackedJobId: t.id,
      title: t.role,
      company: t.company,
      location: t.location || null,
      status: t.status || "Applied",
      source: t.sourceName || "manual",
      appliedDate: t.applicationDate,
      interviewDate: t.interviewDate || null,
      notes: t.notes || null,
      matchScore: engineJobIdStr ? scoreByJobId.get(engineJobIdStr) ?? null : null,
      sourceUrl: t.sourceUrl || null,
      engineJobId: engineJobIdStr,
      // Present only when this job has also entered the automated
      // apply-engine pipeline (POST /api/applications/:jobId) — most
      // TrackedJob rows won't have one, since that's a separate,
      // opt-in automation flow, not something every tracked job goes
      // through.
      engineApplicationStatus: engineApplication ? engineApplication.status : null,
    };
  });
}

module.exports = { getAppliedJobsForUser };
