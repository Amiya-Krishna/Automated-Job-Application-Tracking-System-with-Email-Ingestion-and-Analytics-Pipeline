const router = require("express").Router();
const Job = require("../models/Job");
const auth = require("../middleware/authMiddleware");

// CREATE JOB
router.post("/", auth, async (req, res) => {

  try {

    const job = new Job({
      userId: req.user.id,
      company: req.body.company,
      role: req.body.role,
      status: req.body.status,
      interviewDate: req.body.interviewDate,
      notes: req.body.notes
    });

    await job.save();

    res.json(job);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }

});

// GET ALL JOBS
router.get("/", auth, async (req, res) => {

  try {

    const jobs = await Job.find({ userId: req.user.id });

    res.json(jobs);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }

});

// UPDATE JOB
router.put("/:id", auth, async (req, res) => {

  try {

    const job = await Job.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json(job);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }

});

// DELETE JOB
router.delete("/:id", auth, async (req, res) => {

  try {

    await Job.findByIdAndDelete(req.params.id);

    res.json({ message: "Job deleted" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }

});

module.exports = router;