// Orchestrates the dashboard-triggered "discovery" run: calls each
// requested source's adapter, and only ever ingests jobs an adapter
// actually returned — never fabricates results. Adapters that can't
// legitimately fetch anything (see adapters/linkedinJobsAdapter.js,
// indeedJobsAdapter.js) report `unavailable`/`blocked`/`error` instead of
// empty-but-successful, so the caller can show that honestly.

const { Prisma } = require("@prisma/client");
const prisma = require("../../lib/prisma");
const { ingestJob } = require("../ingestionService");
const linkedin = require("../../adapters/linkedinJobsAdapter");
const indeed = require("../../adapters/indeedJobsAdapter");
const remotive = require("../../adapters/remotiveJobsAdapter");

// remotive is a genuinely functional, no-auth provider (public API — see
// adapters/remotiveJobsAdapter.js). linkedin/indeed remain registered so
// the UI can still show their honest "unavailable" status until real
// partner credentials exist — see those adapters for why.
const ADAPTERS = { linkedin, indeed, remotive };

// A user can delete their own run history mid-flight
// (`DELETE /api/scrape/runs/:id` — scrapeRoutes.js does a hard delete
// with no check for a still-queued/active BullMQ job for that run, by
// design: it's just history, not the shared jobs catalog, so there's
// nothing unsafe about deleting it). That's a real, expected race, not
// a bug to prevent — but it used to crash this function with an
// uncaught Prisma P2025 ("Record to update not found") the moment
// *either* of the two updates below ran after the row was gone, which
// then propagated into scrapeWorker.js's own catch block, which tried
// the SAME now-missing update a second time and threw again — two
// crashes for one deleted row, with the second one masking whatever the
// real discovery outcome (or lack of one) actually was.
//
// This wraps every `scrapeRun.update` so a missing row is treated as
// "nothing left to report to," not a fatal error: log it plainly and
// return `false` so the caller can stop doing further (wasted) work
// instead of continuing to scrape providers for a run nobody will ever
// see the result of.
async function updateScrapeRunIfExists(scrapeRunId, data) {
  try {
    await prisma.scrapeRun.update({ where: { id: scrapeRunId }, data });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      console.warn(
        `[jobDiscovery] scrapeRun ${scrapeRunId} no longer exists (likely deleted from history while ` +
          `still in flight) — skipping this status update rather than crashing.`,
      );
      return false;
    }
    throw err;
  }
}

async function runDiscovery({ scrapeRunId, query, location, sources, limit }) {
  const stillExists = await updateScrapeRunIfExists(scrapeRunId, {
    status: "running",
    startedAt: new Date(),
  });
  if (!stillExists) {
    return { status: "abandoned", results: {} };
  }

  const results = {};
  let anyOk = false;
  let anyFailure = false;

  for (const sourceName of sources) {
    const adapter = ADAPTERS[sourceName];
    if (!adapter) {
      results[sourceName] = {
        status: "error",
        message: `No adapter registered for source "${sourceName}"`,
        found: 0,
        ingested: 0,
      };
      anyFailure = true;
      continue;
    }

    try {
      const outcome = await adapter.discover({ query, location, limit });
      const found = outcome.jobs?.length || 0;
      let ingested = 0;

      for (const job of outcome.jobs || []) {
        try {
          const r = await ingestJob({ ...job, sourceName });
          if (r.status === "new") ingested += 1;
        } catch (err) {
          console.error(`[jobDiscovery] ingest failed for "${job.title}":`, err.message);
        }
      }

      results[sourceName] = {
        status: outcome.status,
        message: outcome.message || null,
        found,
        ingested,
      };

      if (outcome.status === "ok") anyOk = true;
      if (outcome.status === "error") anyFailure = true;
    } catch (err) {
      results[sourceName] = {
        status: "error",
        message: err.message,
        found: 0,
        ingested: 0,
      };
      anyFailure = true;
    }
  }

  // Overall run status: succeeded if at least one source returned real
  // results, blocked if every requested source reported unavailable/
  // blocked (nothing ingested, but not a bug), failed only on genuine
  // adapter errors with nothing to show for it.
  const allUnavailable = Object.values(results).every(
    (r) => r.status === "unavailable" || r.status === "blocked",
  );
  const finalStatus = anyOk
    ? "succeeded"
    : allUnavailable
      ? "blocked"
      : anyFailure
        ? "failed"
        : "succeeded";

  await updateScrapeRunIfExists(scrapeRunId, {
    status: finalStatus,
    results,
    finishedAt: new Date(),
  });

  return { status: finalStatus, results };
}

module.exports = { runDiscovery, ADAPTERS };
