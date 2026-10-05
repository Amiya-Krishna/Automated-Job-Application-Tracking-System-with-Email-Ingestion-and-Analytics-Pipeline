// Safe deletion of shared catalog data (engine jobs, companies, sources). Admin-only
// callers; every function runs in ONE transaction so a failure leaves nothing half-deleted.
//
// What is protected:
//  - users' own tracked_jobs rows are NEVER deleted; only their engine_job_id link
//    (a plain column, not an FK) is cleared so it can't dangle.
//  - match_scores / applications cascade by FK with the job (that is their definition).
//  - duplicate rows pointing at a canonical job are removed with it (the self-FK is NoAction).
//  - a job whose automated application is in flight is refused (409), not yanked away.
const prisma = require("../lib/prisma");

class DeletionError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; Object.assign(this, extra); }
}

const IN_FLIGHT = ["queued", "pending", "applying", "processing", "running"];

async function deleteJobsByIds(tx, ids) {
  if (!ids.length) return 0;
  const inflight = await tx.applications.count({ where: { job_id: { in: ids }, status: { in: IN_FLIGHT } } });
  if (inflight) throw new DeletionError(409, "An application for this job is currently queued or running. Wait for it to finish, then delete.", { code: "application_in_flight" });
  // duplicates (and anything else) that point at these rows
  const dupes = await tx.jobs.findMany({ where: { canonical_job_id: { in: ids }, id: { notIn: ids } }, select: { id: true } });
  const all = [...new Set([...ids, ...dupes.map((d) => d.id)])];
  await tx.trackedJob.updateMany({ where: { engineJobId: { in: all } }, data: { engineJobId: null } });
  // break self/cross references first so the delete is order-independent
  await tx.jobs.updateMany({ where: { id: { in: all } }, data: { canonical_job_id: null } });
  const r = await tx.jobs.deleteMany({ where: { id: { in: all } } });
  return r.count;
}

async function deleteJob(id) {
  return prisma.$transaction(async (tx) => {
    // admin catalog = GLOBAL jobs only; a user's private job is not deletable (or even findable) here
    const job = await tx.jobs.findFirst({ where: { id: BigInt(id), owner_user_id: null }, select: { id: true } });
    if (!job) throw new DeletionError(404, "Job not found");
    return { deletedJobs: await deleteJobsByIds(tx, [job.id]) };
  });
}

async function deleteCompany(id, { withJobs = false } = {}) {
  return prisma.$transaction(async (tx) => {
    const company = await tx.companies.findUnique({ where: { id }, select: { id: true } });
    if (!company) throw new DeletionError(404, "Company not found");
    const jobs = await tx.jobs.findMany({ where: { company_id: id, owner_user_id: null }, select: { id: true } });
    const privateInUse = await tx.jobs.count({ where: { company_id: id, owner_user_id: { not: null } } });
    if (privateInUse) {
      throw new DeletionError(409, "This company is still referenced by users' private jobs and cannot be deleted.", { code: "in_use_by_users" });
    }
    if (jobs.length && !withJobs) {
      throw new DeletionError(409, `This company still has ${jobs.length} job(s). Delete them with the company, or remove the jobs first.`, { code: "has_jobs", jobCount: jobs.length });
    }
    const deletedJobs = await deleteJobsByIds(tx, jobs.map((j) => j.id));
    await tx.companies.delete({ where: { id } });
    return { deletedJobs };
  });
}

async function deleteSource(id, { withJobs = false } = {}) {
  return prisma.$transaction(async (tx) => {
    // only admin-fetched (global) sources can be deleted; manual / gmail / extension are structural
    const source = await tx.job_sources.findFirst({ where: { id, scope: "global" }, select: { id: true, name: true } });
    if (!source) throw new DeletionError(404, "Source not found");
    const jobs = await tx.jobs.findMany({ where: { source_id: id, owner_user_id: null }, select: { id: true } });
    if (jobs.length && !withJobs) {
      throw new DeletionError(409, `This source still has ${jobs.length} job(s). Delete them with the source, or remove the jobs first.`, { code: "has_jobs", jobCount: jobs.length });
    }
    const deletedJobs = await deleteJobsByIds(tx, jobs.map((j) => j.id));
    await tx.job_sources.delete({ where: { id } });
    return { deletedJobs, name: source.name };
  });
}

function sendDeletionError(res, err) {
  if (err instanceof DeletionError) {
    return res.status(err.status).json({ message: err.message, ...(err.code ? { code: err.code } : {}), ...(err.jobCount != null ? { jobCount: err.jobCount } : {}) });
  }
  console.error(`[catalog-delete] failed: ${(err && (err.code || err.name)) || "unknown"}`);
  return res.status(500).json({ message: "Delete failed. Nothing was changed." });
}

module.exports = { deleteJob, deleteCompany, deleteSource, sendDeletionError, DeletionError };
