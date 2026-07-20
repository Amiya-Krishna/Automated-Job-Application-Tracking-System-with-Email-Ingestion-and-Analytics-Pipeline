const router = require("express").Router();
const { query } = require("../db/pg");

router.get("/", async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM user_profile ORDER BY id LIMIT 1");
    res.json({ data: rows[0] || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/profile  body: { fullName, email, resumeText, skills: [], experienceYears }
router.post("/", async (req, res) => {
  try {
    const { fullName, email, resumeText, skills = [], experienceYears } = req.body;
    const existing = await query("SELECT id FROM user_profile ORDER BY id LIMIT 1");

    if (existing.rows.length) {
      await query(
        `UPDATE user_profile
         SET full_name = $1, email = $2, resume_text = $3, skills = $4,
             experience_years = $5, updated_at = now()
         WHERE id = $6`,
        [fullName, email, resumeText, skills, experienceYears, existing.rows[0].id]
      );
      return res.json({ status: "updated" });
    }

    await query(
      `INSERT INTO user_profile (full_name, email, resume_text, skills, experience_years)
       VALUES ($1,$2,$3,$4,$5)`,
      [fullName, email, resumeText, skills, experienceYears]
    );
    res.status(201).json({ status: "created" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
