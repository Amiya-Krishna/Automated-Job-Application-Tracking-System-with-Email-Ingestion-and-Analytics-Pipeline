const router = require("express").Router();
const prisma = require("../lib/prisma"); // recommended centralized client

const { applyQueue, analyticsQueue } = require("../queue");
const { updateWeightsFromOutcome } = require("../services/learningService");

// DIAGNOSTIC (not a behavior change): prints once, at server startup,
// when this exact file is loaded. If you don't see this line in the API
// server's console output when it starts, the running server is NOT
// executing this file — which is the definitive way to confirm/rule out
// an environment or stale-deployment mismatch, as opposed to a code bug
// in this repository. Safe to delete once the mismatch is confirmed.

// This router is mounted at app.use("/api/applications", auth, ...) in
// server.js, so req.user is always populated below.

// ----------------------------------------------------------------------
// Ownership helper
// ----------------------------------------------------------------------
//
// `applications` (the automated apply-engine's own record) is
// intentionally global/job-keyed, not user-keyed — see the multi-user
// audit notes in server.js and appliedJobsService.js. It has no user_id
// column and adding one would conflate "the engine's record of this job"
// with "who applied", which isn't accurate: the engine tracks ONE
// applications row per job regardless of who queued it.
//
// So ownership here is derived transitively through TrackedJob, the
// table that IS user-owned: an `applications` row belongs to user X if X
// has a TrackedJob whose engineJobId points at that application's job_id.
// (See the bridge created in POST /:jobId below — every user who applies
// to an engine job gets exactly one such TrackedJob.) This mirrors
// exactly how appliedJobsService.js already scopes engine data to a user
// for the Applied Jobs page, so an application is visible/actionable by
// a user if and only if it would also show up in their Applied Jobs.
async function ownsApplicationJob(userId, jobId) {
  const owned = await prisma.trackedJob.findFirst({
    where: { userId, engineJobId: jobId },
    select: { id: true },
  });
  return Boolean(owned);
}

// POST /api/applications/:jobId  (Apply / queue an Engine Job)
router.post("/:jobId", async (req, res) => {
  try {
    const jobId = Number(req.params.jobId);
    if (!Number.isFinite(jobId)) {
      return res.status(400).json({ message: "Invalid job id" });
    }

    const job = await prisma.jobs.findUnique({
      where: { id: jobId },
      include: {
        companies: { select: { name: true } },
        job_sources: { select: { name: true } },
      },
    });
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    // Global automation record — unchanged behavior. Still keyed 1:1 by
    // job_id (see the ownership note above for why this stays global).
    await prisma.applications.upsert({
      where: { job_id: jobId },
      update: { status: "pending" },
      create: { job_id: jobId, status: "pending" },
    });

    // Per-user ownership record — this is what makes the applied job
    // actually show up in Applied Jobs for the user who clicked Apply
    // (appliedJobsService.js is driven entirely off tracked_jobs). Uses
    // find-then-create/update instead of a single `upsert()` against the
    // new (userId, engineJobId) composite key because this sandbox can't
    // regenerate the Prisma client against the new unique index (no
    // network access to binaries.prisma.sh — see the migration file's
    // header for the full explanation). The DB-level unique constraint
    // added by that migration still guards against a genuine race
    // between two concurrent requests; caught below via P2002.
    let trackedJob = await prisma.trackedJob.findFirst({
      where: { userId: req.user.id, engineJobId: jobId },
    });

    if (trackedJob) {
      // Second+ click: idempotent update, never a duplicate row. Also
      // covers the case where the user had previously removed/changed
      // this tracked job's status and is now re-applying.
      trackedJob = await prisma.trackedJob.update({
        where: { id: trackedJob.id },
        data: { status: "Applied" },
      });
    } else {
      const data = {
        userId: req.user.id,
        company: job.companies?.name || "Unknown company",
        role: job.title,
        status: "Applied", // matches the existing TrackedJob.status convention
        // (see schema.prisma default + AppliedJobs.jsx's STATUS_OPTIONS)
        sourceName: job.job_sources?.name || "engine",
        sourceUrl: job.source_url,
        externalJobId: job.external_job_id,
        description: job.description,
        location: job.location,
        engineJobId: jobId,
      };
      try {
        trackedJob = await prisma.trackedJob.create({ data });
      } catch (createErr) {
        if (createErr.code === "P2002") {
          // Unique-violation race: another concurrent request for the
          // same user+job created the row a moment ago. Fetch and
          // update it instead of failing the apply.
          const raced = await prisma.trackedJob.findFirst({
            where: { userId: req.user.id, engineJobId: jobId },
          });
          trackedJob = raced
            ? await prisma.trackedJob.update({
                where: { id: raced.id },
                data: { status: "Applied" },
              })
            : null;
        } else {
          throw createErr;
        }
      }
    }

    await applyQueue.add(
      "prepare",
      { jobId, ownerUserId: req.user.id },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );

    // DIAGNOSTIC (not a behavior change): prints the exact payload this
    // request just enqueued. If this line shows `ownerUserId: <a real
    // number>` in the API server's console but applyWorker.js still logs
    // "has no ownerUserId" for the SAME jobId shortly after, that would
    // mean the producer and the worker are not talking to the same
    // Redis/queue — otherwise, if this line is never printed at all when
    // you click Apply, the click isn't reaching this handler. Safe to
    // delete once the mismatch is confirmed.
    console.log("[applyRoutes] enqueued apply job", { jobId, ownerUserId: req.user.id });

    res.status(202).json({
      status: "queued",
      jobId,
      trackedJobId: trackedJob?.id ?? null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/applications?status=pending
//
// SECURITY FIX (multi-user audit): this used to return every user's
// applications, with no ownership filter at all. Scoped here to only the
// jobs THIS user has actually tracked/applied to — see ownsApplicationJob
// above for why that's the correct ownership bridge for a table that has
// no user_id column of its own.
router.get("/", async (req, res) => {
  try {
    const { status } = req.query;

    const owned = await prisma.trackedJob.findMany({
      where: { userId: req.user.id, engineJobId: { not: null } },
      select: { engineJobId: true },
    });
    const jobIds = owned.map((t) => t.engineJobId);

    if (jobIds.length === 0) {
      return res.json({ data: [] });
    }

    const applications = await prisma.applications.findMany({
      where: {
        job_id: { in: jobIds },
        ...(status && { status }),
      },
      include: {
        jobs: {
          include: {
            companies: { select: { name: true } },
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
    });

    res.json({ data: applications });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/applications/:id/submit
//
// SECURITY FIX (multi-user audit): previously updated any application by
// id with no ownership check at all — any authenticated user could mark
// ANY other user's queued application as submitted just by guessing an
// id. Now verifies the application's job is one this user actually owns
// (via their TrackedJob bridge) before touching it.
router.post("/:id/submit", async (req, res) => {
  try {
    const appId = Number(req.params.id);
    if (!Number.isFinite(appId)) {
      return res.status(400).json({ message: "Invalid application id" });
    }

    const existing = await prisma.applications.findUnique({ where: { id: appId } });
    if (!existing || !(await ownsApplicationJob(req.user.id, existing.job_id))) {
      // 404 rather than 403 — never confirm another user's application
      // id even exists.
      return res.status(404).json({ message: "Application not found" });
    }

    const application = await prisma.applications.update({
      where: { id: appId },
      data: {
        status: "applied",
        applied_at: new Date(),
      },
    });

    // Keep the user-facing TrackedJob status in sync so Applied Jobs
    // reflects "actually submitted" too, not just "queued".
    await prisma.trackedJob.updateMany({
      where: { userId: req.user.id, engineJobId: application.job_id },
      data: { status: "Applied" },
    });

    await analyticsQueue.add("recompute", {});

    res.json({ status: "applied", jobId: application.job_id });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Application not found" });
    }
    res.status(500).json({ message: err.message });
  }
});

// POST /api/applications/:id/outcome
//
// SECURITY FIX (multi-user audit): same ownership gap as /submit above —
// fixed the same way.
router.post("/:id/outcome", async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["interview", "rejected", "offer"];

    if (!allowed.includes(status)) {
      return res.status(400).json({
        message: `status must be one of ${allowed.join(", ")}`,
      });
    }

    const appId = Number(req.params.id);
    if (!Number.isFinite(appId)) {
      return res.status(400).json({ message: "Invalid application id" });
    }

    const existing = await prisma.applications.findUnique({ where: { id: appId } });
    if (!existing || !(await ownsApplicationJob(req.user.id, existing.job_id))) {
      return res.status(404).json({ message: "Application not found" });
    }

    const application = await prisma.applications.update({
      where: { id: appId },
      data: {
        status,
        outcome_updated_at: new Date(),
      },
    });

    // TrackedJob.status uses Title-case values (see AppliedJobs.jsx's
    // STATUS_OPTIONS: Applied/Interview/Offer/Rejected) — mirror the
    // engine outcome onto it so the unified Applied Jobs page reflects
    // the real state, not just "Applied" forever.
    const trackedStatus = status.charAt(0).toUpperCase() + status.slice(1);
    await prisma.trackedJob.updateMany({
      where: { userId: req.user.id, engineJobId: application.job_id },
      data: { status: trackedStatus },
    });

    await updateWeightsFromOutcome(application.job_id, status);
    await analyticsQueue.add("recompute", {});

    res.json({ status: "updated" });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Application not found" });
    }
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
