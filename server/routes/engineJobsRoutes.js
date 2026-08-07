const router = require("express").Router();
const { query } = require("../db/pg");

// GET /api/engine/jobs?status=matched&minScore=70&page=1
router.get("/", async (req, res) => {
  try {
    const { status, minScore, page = 1, pageSize = 25 } = req.query;
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`j.status = $${params.length}`);
    }
    if (minScore) {
      params.push(Number(minScore));
      conditions.push(`ms.score >= $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (Number(page) - 1) * Number(pageSize);
    params.push(Number(pageSize), offset);

    const { rows } = await query(
      `SELECT j.id, j.title, j.location, j.remote_type, j.status, j.source_url,
              c.name AS company, ms.score, ms.explanation
       FROM jobs j
       LEFT JOIN companies c ON c.id = j.company_id
       LEFT JOIN match_scores ms ON ms.job_id = j.id AND ms.method = 'tfidf'
       ${where}
       ORDER BY ms.score DESC NULLS LAST, j.scraped_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ data: rows, meta: { page: Number(page), pageSize: Number(pageSize) } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT j.*, c.name AS company, ms.score, ms.explanation
       FROM jobs j
       LEFT JOIN companies c ON c.id = j.company_id
       LEFT JOIN match_scores ms ON ms.job_id = j.id AND ms.method = 'tfidf'
       WHERE j.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Job not found" });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
