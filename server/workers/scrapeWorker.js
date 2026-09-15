const { Worker } = require("bullmq");
const { Prisma } = require("@prisma/client");
const { connection } = require("../queue");
const prisma = require("../lib/prisma");
const { runDiscovery } = require("../services/jobDiscovery");

const scrapeWorker = new Worker(
  "scrape",
  async (bullJob) => {
    const { scrapeRunId, query, location, sources, limit } = bullJob.data;
    console.info(`[scrapeWorker] started run=${scrapeRunId} sources=${sources.join(",")}`);

    try {
      const result = await runDiscovery({ scrapeRunId, query, location, sources, limit });
      console.info(`[scrapeWorker] finished run=${scrapeRunId} status=${result.status}`);
      return result;
    } catch (err) {
      console.error(`[scrapeWorker] run=${scrapeRunId} crashed:`, err.message);

      // Report the crash back onto the ScrapeRun row — but the row may
      // no longer exist (the user can delete their own run history
      // mid-flight via DELETE /api/scrape/runs/:id; see
      // services/jobDiscovery/index.js's updateScrapeRunIfExists for the
      // full explanation). This used to let a second, uncaught Prisma
      // P2025 mask whatever `err` actually was. Now: try to record it,
      // but if the row's gone, just log that plainly and move on — the
      // BullMQ job still fails correctly below either way, via the
      // original `err`, not a replacement one.
      try {
        await prisma.scrapeRun.update({
          where: { id: scrapeRunId },
          data: {
            status: "failed",
            results: { error: err.message },
            finishedAt: new Date(),
          },
        });
      } catch (updateErr) {
        if (updateErr instanceof Prisma.PrismaClientKnownRequestError && updateErr.code === "P2025") {
          console.warn(
            `[scrapeWorker] run=${scrapeRunId} was already deleted from history — ` +
              `couldn't record the failure, but the original error is still reported below.`,
          );
        } else {
          // A genuinely different failure while trying to report the
          // first one (e.g. the database is down) — worth knowing about
          // on its own, but still must not replace `err` below.
          console.error(`[scrapeWorker] run=${scrapeRunId} also failed to record its failure:`, updateErr.message);
        }
      }

      throw err;
    }
  },
  { connection, concurrency: 2, removeOnComplete: true, removeOnFail: false },
);

scrapeWorker.on("failed", (job, err) => {
  console.error(`[scrapeWorker] job=${job?.id} failed:`, err.message);
});

module.exports = scrapeWorker;
