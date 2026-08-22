const router = require("express").Router();
const prisma = require("../lib/prisma");

// SECURITY FIX (multi-user audit): match_scores used to be included here
// with no profile filter at all (`where: { method: "tfidf" }`), which
// worked only by accident of there being a single shared profile/score
// per job. Now that match_scores is per-(job, profile, method), every
// request here is scoped to the requesting user's own profile — `auth`
// is already mounted on this router in server.js, so req.user.id is
// always available. The `jobs`/`companies` catalog itself stays global
// (it's shared discovery data, not private), only the match score shown
// alongside it is user-specific.
async function currentUserProfileId(userId) {
  const profile = await prisma.user_profile.findUnique({
    where: { user_id: userId },
    select: { id: true },
  });
  return profile?.id ?? null;
}

router.get("/", async (req, res) => {
  try {
    const { status, minScore, page = 1, pageSize = 25 } = req.query;

    const pageNum = Number(page);
    const pageSizeNum = Number(pageSize);
    const profileId = await currentUserProfileId(req.user.id);

    // No profile yet: still show the job catalog (useful for browsing
    // Job Discovery results before filling in a resume), just with no
    // match scores attached and minScore filtering disabled (there is
    // nothing to filter on).
    const matchScoresWhere = profileId
      ? { method: "tfidf", profile_id: profileId }
      : { method: "tfidf", profile_id: -1 }; // impossible id -> empty set

    // Prisma's relation `orderBy` only supports `_count` for to-many
    // relations (not `_max`/`_min`/`_avg`), so ordering by "best match
    // score" can't be done at the DB level here without a raw query.
    // Fetch the filtered set ordered by scraped_at, compute each job's
    // best tfidf score in JS, sort by that, then paginate in memory.
    const jobs = await prisma.jobs.findMany({
      where: {
        ...(status && { status }),
        ...(minScore &&
          profileId && {
            match_scores: {
              some: {
                score: { gte: Number(minScore) },
                method: "tfidf",
                profile_id: profileId,
              },
            },
          }),
      },
      include: {
        companies: {
          select: { name: true },
        },
        match_scores: {
          where: matchScoresWhere,
          select: { score: true, explanation: true },
        },
      },
      orderBy: {
        scraped_at: "desc",
      },
      take: 500,
    });

    const bestScore = (job) =>
      job.match_scores.length
        ? Math.max(...job.match_scores.map((m) => Number(m.score)))
        : -1;

    jobs.sort((a, b) => bestScore(b) - bestScore(a));

    const skip = (pageNum - 1) * pageSizeNum;
    const pageJobs = jobs.slice(skip, skip + pageSizeNum);

    res.json({
      data: pageJobs,
      meta: {
        page: pageNum,
        pageSize: pageSizeNum,
        total: jobs.length,
        hasProfile: Boolean(profileId),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const profileId = await currentUserProfileId(req.user.id);
    const matchScoresWhere = profileId
      ? { method: "tfidf", profile_id: profileId }
      : { method: "tfidf", profile_id: -1 };

    const job = await prisma.jobs.findUnique({
      where: {
        id: Number(req.params.id),
      },
      include: {
        companies: {
          select: { name: true },
        },
        match_scores: {
          where: matchScoresWhere,
          select: { score: true, explanation: true },
        },
      },
    });

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    res.json({ data: job });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
