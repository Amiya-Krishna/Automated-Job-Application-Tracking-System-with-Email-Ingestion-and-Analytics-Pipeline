const router = require("express").Router();
const prisma = require("../lib/prisma");
const auth = require("../middleware/authMiddleware");

// SECURITY FIX (multi-user audit): this endpoint used to read/write
// whichever single user_profile row existed in the whole database
// (`findFirst({ orderBy: { id: "asc" } })`), so every logged-in user
// shared one resume/skills/skill-weights and every job's match score was
// silently computed against that one shared profile. Both routes below
// now require `auth` and are scoped to `user_profile.user_id ===
// req.user.id`, matching the schema fix in prisma/schema.prisma.

// GET /api/profile — the authenticated user's own profile only.
router.get("/", auth, async (req, res) => {
  try {
    const profile = await prisma.user_profile.findUnique({
      where: { user_id: req.user.id },
    });

    res.json({ data: profile || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/profile — upsert scoped to the authenticated user.
router.post("/", auth, async (req, res) => {
  try {
    const {
      fullName,
      email,
      resumeText,
      skills = [],
      experienceYears,
    } = req.body;

    const existing = await prisma.user_profile.findUnique({
      where: { user_id: req.user.id },
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
        user_id: req.user.id,
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
