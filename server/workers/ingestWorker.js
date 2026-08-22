const { Worker } = require("bullmq");
const { connection } = require("../queue");
const { ingestJob } = require("../services/ingestionService");
const prisma = require("../lib/prisma");

const ingestWorker = new Worker(
  "ingest",
  async (bullJob) => {
    console.info(`[ingestWorker] started job=${bullJob.id}`);

    const result = await ingestJob(bullJob.data);

    console.info(
      `[ingestWorker] completed job=${bullJob.id} status=${result.status} jobId=${result.jobId || "n/a"}`,
    );

    // If this ingest came from the manual-tracker bridge (engineBridge.js),
    // write the resulting engine job id back onto the TrackedJob so the
    // Applied Jobs UI can surface a match score for it once matchWorker
    // scores it. Best-effort: never fail the ingest job over this.
    //
    // For duplicates, always link to canonicalJobId rather than the
    // per-instance inert "duplicate" row (result.jobId) — match_scores are
    // written against the canonical job (see ingestionService.js's
    // duplicate branch), so linking to the inert row instead would leave
    // engine_job_id pointing at a job with no score ever attached to it.
    const trackedJobId = bullJob.data?.trackedJobId;
    const resolvedJobId =
      result.status === "duplicate" ? result.canonicalJobId : result.jobId;
    if (trackedJobId && resolvedJobId) {
      try {
        await prisma.trackedJob.update({
          where: { id: Number(trackedJobId) },
          data: { engineJobId: BigInt(resolvedJobId) },
        });
      } catch (err) {
        console.warn(
          `[ingestWorker] could not link tracked_job=${trackedJobId} to engine job=${resolvedJobId}:`,
          err.message,
        );
      }
    }

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
