const router = require("express").Router();
const Job = require("../models/Job");
const auth = require("../middleware/authMiddleware");

// CREATE JOB
router.post("/", auth, async (req, res) => {
  try {
    const result = await Job.create({
      userId: req.user.id,
      company: req.body.company,
      role: req.body.role,
      status: req.body.status,
      interviewDate: req.body.interviewDate,
      notes: req.body.notes,
      applicationDate: req.body.applicationDate,
      duplicateStrategy: req.body.duplicateStrategy,
    });

    res.status(result.action === "inserted" ? 201 : 200).json(result.job);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        message: err.message,
        existingJob: err.existingJob || undefined,
      });
  }
});

// GET ALL JOBS
router.get("/", auth, async (req, res) => {
  try {
    const jobs = await Job.findAllByUser(req.user.id);

    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// UPDATE JOB
router.put("/:id", auth, async (req, res) => {
  try {
    // Scope the update to the logged-in user so nobody can edit
    // another user's job just by guessing/knowing the id.
    const job = await Job.findOneAndUpdate(
      req.params.id,
      req.user.id,
      req.body,
    );

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    res.json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE JOB
router.delete("/:id", auth, async (req, res) => {
  try {
    // Same ownership scoping as above.
    const job = await Job.findOneAndDelete(req.params.id, req.user.id);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    res.json({ message: "Job deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
