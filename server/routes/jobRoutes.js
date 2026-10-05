const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const prisma = require("../lib/prisma");
const { bridgeTrackedJobToEngine } = require("../services/engineBridge");
const { getAppliedJobsForUser } = require("../services/appliedJobsService");
const { normalizeJobUrl } = require("../services/jobUrl");
const { normalizeOrigin } = require("../services/visibility");
const { ensureCompany } = require("../services/companyService");

// Optional structured details (salary/stipend text, skills) - clamped so a bad value
// can never fail a save.
function cleanSalary(v) {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 255) : null;
}
function cleanSkills(v) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim().slice(0, 60)))].slice(0, 30);
}

// Fields a client may change through PUT /api/jobs/:id. Anything else (userId,
// engineJobId, createdAt, sourceName/platform = the immutable origin, ...) is ignored rather
// than written.
const UPDATABLE = ["company", "role", "status", "interviewDate", "notes", "applicationDate", "sourceUrl", "externalJobId", "description", "location", "salaryText", "skills"];

// tracked_jobs.interview_date is a String? column (VarChar(50)), not a
// Date. Previously the client sent an ISO string and this route did
// `new Date(req.body.interviewDate)`, which Prisma then rejected/coerced
// unpredictably against a String column. Store exactly what was sent
// (already an ISO "yyyy-mm-dd" string from the client's <input type=date>)
// instead of re-parsing it into a Date object.
function normalizeInterviewDate(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  // Defensive: if something upstream ever does send a Date/number, coerce
  // to an ISO date string rather than letting Prisma choke on a Date
  // object going into a String column.
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// CREATE JOB
//
// Dedup note: this endpoint is hit by the manual "Add Job" form AND by the
// browser extension's "Save to TrackTrail" button, which can legitimately
// fire more than once for the same posting (double-click, re-visiting a
// tab, SPA re-render re-triggering a click handler). Rather than build a
// second, extension-specific duplicate system, we check for an existing
// TrackedJob for this user matching on the same identity signals the
// engine's own dedup (dedupService.js) prefers: externalJobId scoped to
// sourceName first (most precise), then sourceUrl, then normalized
// company+role. A match returns the existing row instead of creating a
// new one, so repeated clicks are idempotent.
async function findExistingTrackedJob(userId, body) {
  const { externalJobId, sourceUrl, company, role } = body;
  const sourceName = normalizeOrigin(body.sourceName, body.platform).origin;

  if (sourceName && externalJobId) {
    const byExternalId = await prisma.trackedJob.findFirst({
      where: { userId, sourceName, externalJobId },
    });
    if (byExternalId) return byExternalId;
  }

  if (sourceUrl) {
    const byUrl = await prisma.trackedJob.findFirst({
      where: { userId, sourceUrl },
    });
    if (byUrl) return byUrl;
  }

  if (company && role) {
    const byCompanyRole = await prisma.trackedJob.findFirst({
      where: {
        userId,
        company: { equals: company, mode: "insensitive" },
        role: { equals: role, mode: "insensitive" },
      },
    });
    if (byCompanyRole) return byCompanyRole;
  }

  return null;
}

router.post("/", auth, async (req, res) => {
  try {
    if (!req.body.company || !req.body.role) {
      return res.status(400).json({ message: "company and role are required" });
    }
    // Validate/clean the posting link once, up front: an invalid, non-http(s) or
    // over-long value is stored as null instead of failing the whole save.
    req.body.sourceUrl = normalizeJobUrl(req.body.sourceUrl);
    // ORIGIN is decided here, not trusted from the client: a saved job is always the user's
    // PRIVATE manual / gmail / extension job. A website name (linkedin, indeed, ...) sent by
    // the extension is only the platform it was captured on.
    const { origin, platform } = normalizeOrigin(req.body.sourceName, req.body.platform);

    const existing = await findExistingTrackedJob(req.user.id, req.body);
    if (existing) {
      // Never fail the save, and never silently drop newly-captured
      // metadata (e.g. the extension found a description this time that
      // it didn't the first time) — merge it in, then re-bridge.
      const merged = await prisma.trackedJob.update({
        where: { id: existing.id },
        data: {
          description: existing.description || req.body.description || null,
          location: existing.location || req.body.location || null,
          sourceUrl: existing.sourceUrl || req.body.sourceUrl || null,
          externalJobId: existing.externalJobId || req.body.externalJobId || null,
          salaryText: existing.salaryText || cleanSalary(req.body.salaryText),
          skills: existing.skills && existing.skills.length ? existing.skills : cleanSkills(req.body.skills),
        },
      });
      try {
        await bridgeTrackedJobToEngine(merged);
      } catch (bridgeErr) {
        console.warn("[jobRoutes] engine bridge failed for duplicate job:", bridgeErr.message);
      }
      return res.status(200).json({ ...merged, duplicate: true });
    }

    const job = await prisma.trackedJob.create({
      data: {
        userId: req.user.id,
        company: req.body.company,
        role: req.body.role,
        status: req.body.status,
        interviewDate: normalizeInterviewDate(req.body.interviewDate),
        notes: req.body.notes,
        applicationDate: req.body.applicationDate
          ? new Date(req.body.applicationDate)
          : new Date(),
        // duplicateStrategy was written here before but isn't a column on
        // TrackedJob in schema.prisma — every create silently depended on
        // Prisma ignoring it (or errored, depending on client version).
        // Removed. Dedup now happens above via findExistingTrackedJob();
        // engine-side dedup for the bridged jobs row happens in
        // dedupService.js.
        sourceName: origin,
        platform,
        sourceUrl: req.body.sourceUrl || null,
        externalJobId: req.body.externalJobId || null,
        description: req.body.description || null,
        location: req.body.location || null,
        salaryText: cleanSalary(req.body.salaryText),
        skills: cleanSkills(req.body.skills),
      },
    });

    try { await ensureCompany(job.company); } catch (e) { console.warn("[jobRoutes] ensureCompany failed:", e.message); }

    // Best-effort bridge into the engine so this job can be matched
    // against the user's profile like any scraped/extension-saved job.
    // Never let a bridge failure fail the manual-add request itself.
    try {
      await bridgeTrackedJobToEngine(job);
    } catch (bridgeErr) {
      console.warn("[jobRoutes] engine bridge failed for new job:", bridgeErr.message);
    }

    res.status(201).json({ ...job, duplicate: false });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET ALL JOBS
router.get("/", auth, async (req, res) => {
  try {
    const jobs = await prisma.trackedJob.findMany({
      where: { userId: req.user.id },
      orderBy: { applicationDate: "desc" },
    });

    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET UNIFIED APPLIED JOBS
//
// Normalizes manual/extension/gmail (all in tracked_jobs) plus, where
// applicable, the automated apply-engine's own status, into one shape.
// See appliedJobsService.js for exactly how these are merged (never a
// blind UNION, never a duplicate row per job).
router.get("/applied", auth, async (req, res) => {
  try {
    const jobs = await getAppliedJobsForUser(req.user.id);
    res.json({ data: jobs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// UPDATE JOB
router.put("/:id", auth, async (req, res) => {
  try {
    const data = {};
    for (const key of UPDATABLE) if (key in (req.body || {})) data[key] = req.body[key];
    if ("sourceUrl" in data) data.sourceUrl = normalizeJobUrl(data.sourceUrl);
    if ("salaryText" in data) data.salaryText = cleanSalary(data.salaryText);
    if ("skills" in data) data.skills = cleanSkills(data.skills);
    if (typeof data.company === "string" && !data.company.trim()) delete data.company;
    if (typeof data.role === "string" && !data.role.trim()) delete data.role;
    if ("interviewDate" in data) {
      data.interviewDate = normalizeInterviewDate(data.interviewDate);
    }
    if ("applicationDate" in data && data.applicationDate) {
      data.applicationDate = new Date(data.applicationDate);
    }

    const job = await prisma.trackedJob.updateMany({
      where: {
        id: parseInt(req.params.id),
        userId: req.user.id,
      },
      data,
    });

    if (job.count === 0) {
      return res.status(404).json({ message: "Job not found" });
    }

    // Re-bridge on update too — e.g. the user pastes in a description
    // after the fact, which is exactly the case that should now start
    // scoring against their profile.
    try {
      const updated = await prisma.trackedJob.findFirst({
        where: { id: parseInt(req.params.id), userId: req.user.id },
      });
      if (updated) await bridgeTrackedJobToEngine(updated);
    } catch (bridgeErr) {
      console.warn("[jobRoutes] engine bridge failed for updated job:", bridgeErr.message);
    }

    res.json({ message: "Job updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE JOB
router.delete("/:id", auth, async (req, res) => {
  try {
    const job = await prisma.trackedJob.deleteMany({
      where: {
        id: parseInt(req.params.id),
        userId: req.user.id,
      },
    });

    if (job.count === 0) {
      return res.status(404).json({ message: "Job not found" });
    }

    res.json({ message: "Job deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
