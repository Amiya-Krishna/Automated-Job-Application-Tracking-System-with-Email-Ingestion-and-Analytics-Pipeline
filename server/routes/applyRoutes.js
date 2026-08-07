const router = require("express").Router();
const prisma = require("../lib/prisma"); // recommended centralized client

const { applyQueue, analyticsQueue } = require("../queue");
const { updateWeightsFromOutcome } = require("../services/learningService");


// POST /api/apply/:jobId
router.post("/:jobId", async (req, res) => {
  try {
    const jobId = Number(req.params.jobId);

    // UPSERT application (same as ON CONFLICT)
    await prisma.applications.upsert({
      where: {
        job_id: jobId, // must be unique in schema
      },
      update: {
        status: "pending",
      },
      create: {
        job_id: jobId,
        status: "pending",
      },
    });

    await applyQueue.add("prepare", { jobId }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    });

    res.status(202).json({ status: "queued", jobId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// GET /api/applications?status=pending_review
router.get("/", async (req, res) => {
  try {
    const { status } = req.query;

    const applications = await prisma.applications.findMany({
      where: {
        ...(status && { status }),
      },
      include: {
        jobs: {
          include: {
            companies: {
              select: { name: true },
            },
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
router.post("/:id/submit", async (req, res) => {
  try {
    const appId = Number(req.params.id);

    const application = await prisma.applications.update({
      where: { id: appId },
      data: {
        status: "applied",
        applied_at: new Date(),
      },
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

    const application = await prisma.applications.update({
      where: { id: appId },
      data: {
        status,
        outcome_updated_at: new Date(),
      },
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