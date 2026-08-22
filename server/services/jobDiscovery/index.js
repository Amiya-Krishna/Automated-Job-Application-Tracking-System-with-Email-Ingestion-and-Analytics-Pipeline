// Orchestrates the dashboard-triggered "discovery" run: calls each
// requested source's adapter, and only ever ingests jobs an adapter
// actually returned — never fabricates results. Adapters that can't
// legitimately fetch anything (see adapters/linkedinJobsAdapter.js,
// indeedJobsAdapter.js) report `unavailable`/`blocked`/`error` instead of
// empty-but-successful, so the caller can show that honestly.

const prisma = require("../../lib/prisma");
const { ingestJob } = require("../ingestionService");
const linkedin = require("../../adapters/linkedinJobsAdapter");
const indeed = require("../../adapters/indeedJobsAdapter");

const ADAPTERS = { linkedin, indeed };

async function runDiscovery({ scrapeRunId, query, location, sources, limit }) {
  await prisma.scrapeRun.update({
    where: { id: scrapeRunId },
    data: { status: "running", startedAt: new Date() },
  });

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

  await prisma.scrapeRun.update({
    where: { id: scrapeRunId },
    data: { status: finalStatus, results, finishedAt: new Date() },
  });

  return { status: finalStatus, results };
}

module.exports = { runDiscovery, ADAPTERS };
