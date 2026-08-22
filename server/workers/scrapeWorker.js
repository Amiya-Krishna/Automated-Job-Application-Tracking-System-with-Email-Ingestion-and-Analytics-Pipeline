const { Worker } = require("bullmq");
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
      await prisma.scrapeRun.update({
        where: { id: scrapeRunId },
        data: {
          status: "failed",
          results: { error: err.message },
          finishedAt: new Date(),
        },
      });
      throw err;
    }
  },
  { connection, concurrency: 2, removeOnComplete: true, removeOnFail: false },
);

scrapeWorker.on("failed", (job, err) => {
  console.error(`[scrapeWorker] job=${job?.id} failed:`, err.message);
});

module.exports = scrapeWorker;
