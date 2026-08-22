// Bridges the manual tracker (TrackedJob) into the engine pipeline
// (jobs / match_scores) so "matching must run for manually added jobs"
// without duplicating dedup/normalization logic that already lives in
// ingestionService.js.
//
// Design: a TrackedJob only has `company` + `role` required by its own
// form. The engine's `jobs` table requires a non-null `description` and
// `source_url`. So we only bridge a TrackedJob once it has *enough* data
// to be meaningfully matched and deduped — otherwise we'd be creating
// junk engine rows with empty descriptions that would always score 0 and
// pollute the corpus used for TF-IDF idf weighting.
//
// "Enough data" = company + role + (description OR sourceUrl). This
// covers: extension-captured jobs (have sourceUrl, sometimes description),
// and manually typed jobs where the user pasted a description.

const { ingestQueue } = require("../queue");
const { contentHash } = require("./textUtils");

function hasEnoughDataToBridge(trackedJob) {
  return Boolean(
    trackedJob.company &&
      trackedJob.role &&
      (trackedJob.description || trackedJob.sourceUrl)
  );
}

/**
 * Enqueues a TrackedJob for engine ingestion (dedup + insert into `jobs` +
 * enqueue for matching). Fire-and-forget from the caller's perspective —
 * the ingest worker does the actual DB write, same as the extension/scraper
 * paths, so a slow ingest never blocks the manual-job HTTP response.
 *
 * Returns the queued BullMQ job, or null if there wasn't enough data to
 * bridge (which is a normal, expected outcome, not an error).
 */
async function bridgeTrackedJobToEngine(trackedJob) {
  if (!hasEnoughDataToBridge(trackedJob)) return null;

  const payload = {
    title: trackedJob.role,
    company: trackedJob.company,
    description: trackedJob.description || "",
    location: trackedJob.location || null,
    remoteType: null,
    sourceName: trackedJob.sourceName || "manual",
    sourceUrl:
      trackedJob.sourceUrl ||
      // The engine's `jobs.source_url` column is NOT NULL. Hand-typed
      // manual jobs legitimately have no URL, so synthesize a stable,
      // clearly-labeled placeholder instead of silently dropping the
      // bridge (or lying about where it came from).
      `internal://manual-tracked-job/${trackedJob.id}`,
    externalJobId: trackedJob.externalJobId || `tracked-job-${trackedJob.id}`,
    postedAt: null,
    // Not part of the engine `jobs` schema — ingestWorker reads this to
    // write the resulting engine job id back onto tracked_jobs.engine_job_id
    // once ingestion completes, so the Applied Jobs UI can show a match
    // score for manually added rows.
    trackedJobId: trackedJob.id,
    // Also not part of the `jobs` schema — ingestionService forwards this
    // onto the matchQueue payload so matchWorker scores THIS user's
    // profile (instead of fanning out over every profile, which is only
    // needed for jobs nobody in particular submitted, like scrape/
    // discovery results). See matchWorker.js.
    ownerUserId: trackedJob.userId,
  };

  const jobId = `ingest:manual:tracked-job:${trackedJob.id}:${contentHash(payload)}`;

  return ingestQueue.add("ingest", payload, {
    jobId,
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  });
}

module.exports = { bridgeTrackedJobToEngine, hasEnoughDataToBridge };
