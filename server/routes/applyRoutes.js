const router = require("express").Router();
const { query } = require("../db/pg");
const { applyQueue, analyticsQueue } = require("../queue");
const { updateWeightsFromOutcome } = require("../services/learningService");

// POST /api/apply/:jobId -> enqueues apply:prepare
router.post("/:jobId", async (req, res) => {
  try {
    const jobId = Number(req.params.jobId);
    await query(
      `INSERT INTO applications (job_id, status) VALUES ($1, 'pending')
       ON CONFLICT (job_id) DO UPDATE SET status = 'pending'`,
      [jobId]
    );
    await applyQueue.add("prepare", { jobId }, { attempts: 3, backoff: { type: "exponential", delay: 5000 } });
    res.status(202).json({ status: "queued", jobId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/applications?status=pending_review
router.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = "";
    if (status) {
      params.push(status);
      where = "WHERE a.status = $1";
    }
    const { rows } = await query(
      `SELECT a.*, j.title, j.source_url, c.name AS company
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       LEFT JOIN companies c ON c.id = j.company_id
       ${where}
       ORDER BY a.created_at DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/applications/:id/submit -> user confirms they manually hit submit
router.post("/:id/submit", async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE applications SET status = 'applied', applied_at = now() WHERE id = $1 RETURNING job_id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Application not found" });
    await analyticsQueue.add("recompute", {});
    res.json({ status: "applied" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/applications/:id/outcome  body: { status: 'interview'|'rejected'|'offer' }
router.post("/:id/outcome", async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["interview", "rejected", "offer"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `status must be one of ${allowed.join(", ")}` });
    }
    const { rows } = await query(
      `UPDATE applications SET status = $1, outcome_updated_at = now() WHERE id = $2 RETURNING job_id`,
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Application not found" });

    await updateWeightsFromOutcome(rows[0].job_id, status);
    await analyticsQueue.add("recompute", {});
    res.json({ status: "updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
