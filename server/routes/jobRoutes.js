const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const prisma = require("../lib/prisma");

// CREATE JOB
router.post("/", auth, async (req, res) => {
  try {
    const job = await prisma.trackedJob.create({
      data: {
        userId: req.user.id,
        company: req.body.company,
        role: req.body.role,
        status: req.body.status,
        interviewDate: req.body.interviewDate
          ? new Date(req.body.interviewDate)
          : null,
        notes: req.body.notes,
        applicationDate: req.body.applicationDate
          ? new Date(req.body.applicationDate)
          : new Date(),
        duplicateStrategy: req.body.duplicateStrategy,
      },
    });

    res.status(201).json(job);
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

// UPDATE JOB
router.put("/:id", auth, async (req, res) => {
  try {
    const job = await prisma.trackedJob.updateMany({
      where: {
        id: parseInt(req.params.id),
        userId: req.user.id,
      },
      data: req.body,
    });

    if (job.count === 0) {
      return res.status(404).json({ message: "Job not found" });
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