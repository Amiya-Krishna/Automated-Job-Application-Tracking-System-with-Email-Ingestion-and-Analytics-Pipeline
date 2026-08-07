const { Worker } = require("bullmq");
const { connection } = require("../queue");
const { ingestJob } = require("../services/ingestionService");

const ingestWorker = new Worker(
  "ingest",
  async (bullJob) => {
    console.info(`[ingestWorker] started job=${bullJob.id}`);

    const result = await ingestJob(bullJob.data);

    console.info(
      `[ingestWorker] completed job=${bullJob.id} status=${result.status} jobId=${result.jobId || "n/a"}`,
    );

    return result;
  },
  {
    connection,
    concurrency: 4,
    removeOnComplete: true,
    removeOnFail: false,
  },
);

ingestWorker.on("completed", (job) => {
  console.info(`[ingestWorker] finalized job=${job.id}`);
});

ingestWorker.on("failed", (job, err) => {
  console.error(
    `[ingestWorker] job=${job?.id || "unknown"} failed attempt=${job?.attemptsMade || 0}: ${err.message}`,
  );
});

module.exports = ingestWorker;
