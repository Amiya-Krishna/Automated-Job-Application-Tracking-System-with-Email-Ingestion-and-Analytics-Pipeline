const router = require("express").Router();
const prisma = require("../lib/prisma");

// Sources that represent the shared/global scraped catalog. These are
// genuinely discovered by the scraper on behalf of every user, so their
// count is the global engine `jobs` count for that source — the same
// meaning as before this fix. Remotive joins this set for the same reason
// linkedin/indeed are here: it's a discovery-run source ingested into the
// shared `jobs` table, not a per-user tracked source (see
// adapters/remotiveJobsAdapter.js).
const GLOBAL_ENGINE_SOURCES = new Set(["linkedin", "indeed", "remotive", "naukri", "internshala", "wellfound", "unstop"]);

// GET /api/sources -> browses the `job_sources` table (LinkedIn, Indeed,
// Manual, Gmail, Extension — see seedSources.js for the full set), with a
// job count per source so the UI can show how productive each one is.
//
// BUG FIX (Sources page showing "Manual = 0"): this used to report
// `_count.jobs` for every source — i.e. the global engine `jobs` table
// count. That's the right dataset for linkedin/indeed (genuinely shared,
// scraper-discovered jobs), but wrong for manual/gmail/extension, which
// are USER-OWNED and live in `tracked_jobs`, not `jobs` — and only ever
// get bridged into `jobs` once they have enough data to match against
// (see engineBridge.js's hasEnoughDataToBridge). A hand-typed manual job
// with no description/URL never reaches `jobs` at all, so it was
// invisible to the old query regardless of whose data was being counted
// — and even where it WOULD have counted something, it would have been
// every user's manual jobs combined, not just the requesting user's.
//
// Now: for manual/gmail/extension, count THIS user's own tracked_jobs
// rows by sourceName. For linkedin/indeed, keep the global engine count
// (see GLOBAL_ENGINE_SOURCES above). Both raw numbers are still returned
// (engineJobCount, trackedJobCount) alongside the single `jobCount` the
// UI actually renders, so the meaning of each is explicit rather than
// silently conflated.
router.get("/", async (req, res) => {
  try {
    const [sources, trackedCounts] = await Promise.all([
      prisma.job_sources.findMany({
        include: {
          _count: { select: { jobs: true } },
        },
        orderBy: { name: "asc" },
      }),
      // One grouped query for all of this user's tracked_jobs, instead
      // of one query per source — cheap and avoids N+1.
      prisma.trackedJob.groupBy({
        by: ["sourceName"],
        where: { userId: req.user.id },
        _count: { _all: true },
      }),
    ]);

    const trackedCountByName = new Map(
      trackedCounts.map((t) => [(t.sourceName || "manual").toLowerCase(), t._count._all]),
    );

    res.json({
      data: sources.map((s) => {
        const key = s.name.toLowerCase();
        const engineJobCount = s._count.jobs;
        const trackedJobCount = trackedCountByName.get(key) || 0;
        const jobCount = GLOBAL_ENGINE_SOURCES.has(key) ? engineJobCount : trackedJobCount;

        return {
          id: s.id,
          name: s.name,
          baseUrl: s.base_url,
          createdAt: s.created_at,
          // engineJobCount: global, scraper-ingested `jobs` rows for this
          //   source (shared catalog data — same for every user).
          // trackedJobCount: THIS user's own tracked_jobs rows tagged
          //   with this sourceName (manual adds, extension saves, Gmail
          //   imports).
          // jobCount: the number the UI renders — engineJobCount for the
          //   global sources (linkedin/indeed), trackedJobCount for the
          //   per-user ones (manual/gmail/extension), so "Manual" always
          //   reflects what the requesting user actually added, and
          //   never another user's or the whole table's count.
          engineJobCount,
          trackedJobCount,
          jobCount,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sources/:id -> a single source's detail view.
//
// For the global sources (linkedin/indeed) this still shows the shared
// engine `jobs` sample, same as before. For the per-user sources
// (manual/gmail/extension) it now shows THIS user's own tracked_jobs
// instead of the (almost always empty, and if not empty then wrongly
// global) engine `jobs` list, matching the same ownership fix as above.
router.get("/:id", async (req, res) => {
  try {
    const source = await prisma.job_sources.findUnique({
      where: { id: Number(req.params.id) },
    });

    if (!source) {
      return res.status(404).json({ message: "Source not found" });
    }

    const key = source.name.toLowerCase();

    if (GLOBAL_ENGINE_SOURCES.has(key)) {
      const jobs = await prisma.jobs.findMany({
        where: { source_id: source.id },
        select: {
          id: true,
          title: true,
          status: true,
          location: true,
          posted_at: true,
          source_url: true,
          companies: { select: { name: true } },
        },
        orderBy: { scraped_at: "desc" },
        take: 25,
      });
      return res.json({ data: { ...source, jobs } });
    }

    const trackedJobs = await prisma.trackedJob.findMany({
      where: { userId: req.user.id, sourceName: source.name },
      select: {
        id: true,
        company: true,
        role: true,
        status: true,
        location: true,
        applicationDate: true,
        sourceUrl: true,
      },
      orderBy: { applicationDate: "desc" },
      take: 25,
    });
    res.json({ data: { ...source, trackedJobs } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
