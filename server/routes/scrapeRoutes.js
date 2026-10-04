const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const prisma = require("../lib/prisma");
const { scrapeQueue } = require("../queue");
const { allowAction } = require("../services/rateLimiter");
const { ADAPTERS } = require("../services/jobDiscovery");

const VALID_SOURCES = Object.keys(ADAPTERS); // linkedin, indeed, remotive, naukri, internshala, wellfound, unstop
// (Mounted behind auth + requireAdmin in server.js: every route in this file is admin-only.)
const MAX_RUNS_PER_HOUR = 6;
const MAX_LIMIT_PER_SOURCE = 50;

// GET /api/scrape/platforms — the sources a discovery run can use (drives the admin UI).
router.get("/platforms", (req, res) => {
  res.json({ data: VALID_SOURCES });
});

// POST /api/scrape/run — trigger a discovery run for the given query.
router.post("/run", auth, async (req, res) => {
  try {
    const { query, location, sources, limit } = req.body || {};

    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(400).json({ message: "query is required" });
    }
    if (query.length > 255) {
      return res.status(400).json({ message: "query must be under 255 characters" });
    }

    const requestedSources = Array.isArray(sources) && sources.length ? sources : VALID_SOURCES;
    const invalidSources = requestedSources.filter((s) => !VALID_SOURCES.includes(s));
    if (invalidSources.length) {
      return res.status(400).json({
        message: `Unknown source(s): ${invalidSources.join(", ")}. Valid sources: ${VALID_SOURCES.join(", ")}`,
      });
    }

    const parsedLimit = Number(limit) || 25;
    if (parsedLimit < 1 || parsedLimit > MAX_LIMIT_PER_SOURCE) {
      return res.status(400).json({
        message: `limit must be between 1 and ${MAX_LIMIT_PER_SOURCE}`,
      });
    }

    const allowed = await allowAction(
      `ratelimit:scrape:user:${req.user.id}`,
      MAX_RUNS_PER_HOUR,
      3600,
    );
    if (!allowed) {
      return res.status(429).json({
        message: `You can trigger at most ${MAX_RUNS_PER_HOUR} discovery runs per hour. Try again later.`,
      });
    }

    const scrapeRun = await prisma.scrapeRun.create({
      data: {
        userId: req.user.id,
        query: query.trim(),
        location: location?.trim() || null,
        sources: requestedSources,
        limitPerSource: parsedLimit,
        status: "queued",
      },
    });

    // Enqueue and return immediately — the scrape worker does the actual
    // adapter calls + ingestion off the request thread.
    const bullJob = await scrapeQueue.add(
      "discover",
      {
        scrapeRunId: scrapeRun.id,
        query: query.trim(),
        location: location?.trim() || null,
        sources: requestedSources,
        limit: parsedLimit,
      },
      { attempts: 2, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: true },
    );

    await prisma.scrapeRun.update({
      where: { id: scrapeRun.id },
      data: { bullJobId: String(bullJob.id) },
    });

    res.status(202).json({
      status: "queued",
      runId: scrapeRun.id,
      sources: requestedSources,
    });
  } catch (err) {
    console.error("[scrapeRoutes]", err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/scrape/runs/:id — poll run status.
//
// Fix for a production bug: this is a live-status polling endpoint (the
// frontend hits it every 2s while a run is queued/running — see
// client/src/pages/JobDiscovery.jsx's pollRun()), but Express's default
// `res.json()` computes a weak ETag from the response body and honors any
// `If-None-Match` a client sends, replying 304 with an EMPTY body whenever
// the body is byte-identical to what that ETag represents. axios's default
// `validateStatus` only treats 2xx as success, so if a 304 ever reaches it
// directly (rather than being transparently absorbed into a 200 by a
// browser's HTTP cache), the request promise REJECTS with
// `err.response.status === 304`, hits pollRun()'s catch block, and
// PERMANENTLY clearInterval()s the poll loop — the UI then freezes on
// whatever status it last saw, exactly matching "stale run status/results
// remain visible." (Verified directly: a plain axios client, given the
// same route shape, does reject on a raw 304 with
// "Request failed with status code 304".)
//
// Fix: mark this one response `Cache-Control: no-store` (so a
// spec-compliant browser never stores it and therefore never sends
// `If-None-Match` for it again) AND bypass Express's `res.json()`/`send()`
// machinery for this route specifically, so no ETag is generated here at
// all — closing the 304 path completely regardless of what conditional
// header any client, proxy, or cache might still send. Response shape,
// status codes, and every other route are unchanged; this doesn't touch
// caching anywhere else in the API.
router.get("/runs/:id", auth, async (req, res) => {
  try {
    const run = await prisma.scrapeRun.findFirst({
      where: { id: Number(req.params.id), userId: req.user.id },
    });
    if (!run) return res.status(404).json({ message: "Run not found" });
    res.set("Cache-Control", "no-store");
    res.status(200).type("application/json").end(JSON.stringify({ data: run }));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/scrape/runs — recent run history for the dashboard control.
router.get("/runs", auth, async (req, res) => {
  try {
    const runs = await prisma.scrapeRun.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    res.json({ data: runs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/scrape/runs/:id — remove one of the current user's own
// discovery-run history entries.
//
// Data-model note (see the investigation in the accompanying report): the
// "cards" shown on this page's "Recent runs" list are ScrapeRun rows —
// metadata about a search the user triggered (query, sources, status) —
// never actual job postings. A ScrapeRun has no downstream foreign-key
// references anywhere in the schema (confirmed: only `User.scrapeRuns`
// points at it, nothing points *into* it), and it's already strictly
// single-user (`userId`, `onDelete: Cascade` from User). So unlike the
// shared `jobs` catalog — where hiding one user's dislike must never
// affect another user's view of the same canonical listing — a genuine
// hard delete of a user's own run-history row is safe: it can't touch
// `jobs`, `match_scores`, `applications`, `analytics_daily`, or any other
// user's data, since nothing else references it and it was never shared.
// No new column, no soft-delete flag, no migration needed.
//
// Mirrors the existing DELETE /api/jobs/:id pattern exactly
// (deleteMany scoped by both id AND userId, count===0 -> 404) so
// ownership is enforced at the query itself — req.user.id comes from the
// verified JWT (authMiddleware), never from anything the client sends.
router.delete("/runs/:id", auth, async (req, res) => {
  try {
    const result = await prisma.scrapeRun.deleteMany({
      where: { id: Number(req.params.id), userId: req.user.id },
    });
    if (result.count === 0) {
      return res.status(404).json({ message: "Run not found" });
    }
    res.json({ message: "Run removed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
