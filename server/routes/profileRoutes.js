const router = require("express").Router();
const prisma = require("../lib/prisma");


// GET /api/profile
router.get("/", async (req, res) => {
  try {
    const profile = await prisma.user_profile.findFirst({
      orderBy: { id: "asc" },
    });

    res.json({ data: profile || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// POST /api/profile
router.post("/", async (req, res) => {
  try {
    const {
      fullName,
      email,
      resumeText,
      skills = [],
      experienceYears,
    } = req.body;

    const existing = await prisma.user_profile.findFirst({
      orderBy: { id: "asc" },
    });

    if (existing) {
      await prisma.user_profile.update({
        where: { id: existing.id },
        data: {
          full_name: fullName,
          email,
          resume_text: resumeText,
          skills,
          experience_years: experienceYears,
          updated_at: new Date(),
        },
      });

      return res.json({ status: "updated" });
    }

    await prisma.user_profile.create({
      data: {
        full_name: fullName,
        email,
        resume_text: resumeText,
        skills,
        experience_years: experienceYears,
      },
    });

    res.status(201).json({ status: "created" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;