import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import Navbar from "../components/Navbar";
import toast from "react-hot-toast";

// Matches the real backend contract in server/routes/scrapeRoutes.js —
// nothing here is invented. POST /api/scrape/run body:
//   { query, location, sources: ["remotive","linkedin","indeed"], limit }
// -> { status: "queued", runId, sources }
// GET /api/scrape/runs/:id -> { data: ScrapeRun }
//   ScrapeRun.status: queued | running | succeeded | failed | blocked
//   ScrapeRun.results: { [sourceName]: { status, message, found, ingested } }
//
// Provider honesty: Remotive (server/adapters/remotiveJobsAdapter.js) is a
// free, no-auth public API and actually returns real remote listings today
// — it's on by default. LinkedIn and Indeed have no public self-serve
// search API, and their adapters are unimplemented placeholders even when
// a credential env var is set (see linkedinJobsAdapter.js's/
// indeedJobsAdapter.js's "not implemented yet" placeholder) — so the copy
// below says "not implemented," not just "needs credentials," to avoid
// implying they'd start working the moment a token is added.
const SOURCES = [
  { value: "remotive", label: "Remotive", note: "Real remote listings — no setup needed" },
  { value: "linkedin", label: "LinkedIn", note: "Not implemented — no official partner integration yet" },
  { value: "indeed", label: "Indeed", note: "Not implemented — no official partner integration yet" },
];
const DEFAULT_SOURCES = ["remotive"];

const RUN_STATUS_STYLES = {
  queued: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  running: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  succeeded: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  blocked: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

// Per-source adapter statuses returned inside ScrapeRun.results — separate
// from the overall run status above.
const SOURCE_STATUS_LABEL = {
  ok: "Imported",
  unavailable: "Unavailable",
  blocked: "Blocked",
  error: "Error",
};

function RunStatusBadge({ status }) {
  const style = RUN_STATUS_STYLES[status] || RUN_STATUS_STYLES.queued;
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${style}`}>
      {status || "queued"}
    </span>
  );
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Renders the honest outcome of a finished run — never fabricates a
// success message. If every requested source came back unavailable/
// blocked, says so plainly instead of implying jobs were found.
function RunResultsSummary({ run }) {
  if (!run.results || Object.keys(run.results).length === 0) return null;

  const entries = Object.entries(run.results);
  const totalFound = entries.reduce((sum, [, r]) => sum + (r.found || 0), 0);
  const totalIngested = entries.reduce((sum, [, r]) => sum + (r.ingested || 0), 0);
  const allUnavailable = entries.every(
    ([, r]) => r.status === "unavailable" || r.status === "blocked",
  );

  return (
    <div className="mt-3 space-y-2">
      {allUnavailable ? (
        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
          Discovery could not access the selected providers. No jobs were imported.
        </p>
      ) : (
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Found {totalFound} listing{totalFound === 1 ? "" : "s"}, imported {totalIngested} new job
          {totalIngested === 1 ? "" : "s"}.
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {entries.map(([source, r]) => (
          <div
            key={source}
            className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold capitalize text-slate-900 dark:text-slate-100">
                {source}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  r.status === "ok"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : r.status === "error"
                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                }`}
              >
                {SOURCE_STATUS_LABEL[r.status] || r.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {r.status === "ok"
                ? `${r.found} found · ${r.ingested} new`
                : r.message || "No details returned."}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function JobDiscovery() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [sources, setSources] = useState(DEFAULT_SOURCES);
  const [limit, setLimit] = useState(25);

  const [activeRun, setActiveRun] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [history, setHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [removingRunId, setRemovingRunId] = useState(null);

  const pollRef = useRef(null);
  // Root-cause context for the timeout below: a ScrapeRun starts at
  // "queued" (server/routes/scrapeRoutes.js) and only moves to "running"
  // once server/workers/scrapeWorker.js actually picks the BullMQ job up
  // — which requires the separate `npm run worker` process to be running
  // (see README.md / docs/GETTING_STARTED.md's troubleshooting section,
  // which already documents this exact requirement). If that process
  // isn't running, or Redis is unreachable from it, the job sits queued
  // in Redis forever and this poll would otherwise say "Waiting for a
  // worker..." indefinitely with no way for the user to tell a genuine
  // slow run from a worker that will never come. This is a real,
  // separate failure mode from anything runDiscovery()/the Remotive
  // adapter can throw — those are already caught and turned into a
  // "failed" ScrapeRun (services/jobDiscovery/index.js,
  // adapters/remotiveJobsAdapter.js's own 10s request timeout) — so no
  // amount of fixing that code path closes this one; only the client
  // giving up and saying so does.
  const QUEUED_TIMEOUT_MS = 45000;
  const pollStartedAtRef = useRef(null);
  const [runTimedOut, setRunTimedOut] = useState(false);

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    setHistoryError("");
    try {
      const res = await api.get("/scrape/runs");
      setHistory(res.data?.data || []);
    } catch (err) {
      setHistoryError(err.response?.data?.message || "Failed to load discovery history");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Removes one of the current user's own run-history entries (see
  // DELETE /api/scrape/runs/:id in server/routes/scrapeRoutes.js — these
  // rows are ScrapeRun history metadata, not job postings, so removing one
  // never touches any imported/matched job). Mirrors the existing
  // AppliedJobs.jsx removeJob() pattern: confirm, call the API, drop it
  // from local state on success (no full reload), toast on either outcome.
  const removeRun = async (run) => {
    if (
      !window.confirm(
        `Remove this discovery run ("${run.query}") from your history? This won't affect any jobs already imported.`,
      )
    ) {
      return;
    }
    setRemovingRunId(run.id);
    try {
      await api.delete(`/scrape/runs/${run.id}`);
      setHistory((cur) => cur.filter((r) => r.id !== run.id));
      if (activeRun?.id === run.id) setActiveRun(null);
      toast.success("Removed");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to remove run");
    } finally {
      setRemovingRunId(null);
    }
  };

  useEffect(() => {
    // Same pattern already used throughout this codebase for the
    // initial data load (see AppliedJobs.jsx, MatchedJobs.jsx, etc.).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const toggleSource = (value) => {
    setSources((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    );
  };

  const pollRun = (runId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollStartedAtRef.current = Date.now();
    setRunTimedOut(false);
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/scrape/runs/${runId}`);
        const run = res.data?.data;
        if (!run) return;
        setActiveRun(run);

        if (["succeeded", "failed", "blocked"].includes(run.status)) {
          clearInterval(pollRef.current);
          pollRef.current = null;

          if (run.status === "succeeded") {
            toast.success("Discovery run finished");
          } else if (run.status === "blocked") {
            toast("Providers were unavailable — no jobs imported.", { icon: "⚠️" });
          } else {
            toast.error("Discovery run failed");
          }
          loadHistory();
          return;
        }

        // Still "queued" (never even reached "running") past the
        // timeout: the worker process most likely isn't running, or
        // can't reach Redis. This is the fix for the reported "stuck at
        // Waiting for worker forever" bug — the run itself is left
        // alone (still genuinely queued server-side, and will resume
        // updating on its own the moment a worker does pick it up), but
        // the UI stops pretending it knows that's imminent.
        if (run.status === "queued" && Date.now() - pollStartedAtRef.current > QUEUED_TIMEOUT_MS) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setRunTimedOut(true);
          toast.error("No worker picked this up in time.");
        }
      } catch (err) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        toast.error(err.response?.data?.message || "Lost track of the discovery run");
      }
    }, 2000);
  };

  const runDiscovery = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!query.trim()) {
      setFormError("Enter a search query first.");
      return;
    }
    if (sources.length === 0) {
      setFormError("Select at least one provider.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post("/scrape/run", {
        query: query.trim(),
        location: location.trim() || undefined,
        sources,
        limit: Number(limit) || 25,
      });

      const { runId, sources: queuedSources } = res.data || {};
      setActiveRun({
        id: runId,
        status: "queued",
        query: query.trim(),
        sources: queuedSources,
        results: null,
      });
      pollRun(runId);
    } catch (err) {
      const message = err.response?.data?.message || "Failed to start discovery run";
      setFormError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Navbar />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <span className="inline-flex rounded-full bg-cyan-100 dark:bg-cyan-950 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-800 dark:text-cyan-300">
          Engine
        </span>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
          Job discovery
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
          Currently searches real remote listings from Remotive's public API —
          no setup required. LinkedIn and Indeed are listed too, but neither
          offers a public self-serve search API and neither is implemented
          yet, so those stay off by default; results are only ever real
          listings a provider actually returned, never fabricated. See{" "}
          <Link to="/matched-jobs" className="font-semibold text-cyan-700 dark:text-cyan-400 hover:underline">
            Matched Jobs
          </Link>{" "}
          for anything imported here, once it's been scored.
        </p>

        <form
          onSubmit={runDiscovery}
          className="mt-6 rounded-[28px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Search query
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Senior Frontend Engineer"
                className="mt-1.5 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 dark:focus:ring-cyan-900"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Location <span className="normal-case text-slate-400 dark:text-slate-500">(optional)</span>
              </span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Remote, or a city"
                className="mt-1.5 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 dark:focus:ring-cyan-900"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-6">
            <div>
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Providers
              </span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {SOURCES.map((s) => (
                  <label
                    key={s.value}
                    className={`flex cursor-pointer flex-col gap-0.5 rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                      sources.includes(s.value)
                        ? "border-slate-950 dark:border-cyan-500 bg-slate-950 dark:bg-cyan-950 text-white dark:text-cyan-200"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={sources.includes(s.value)}
                        onChange={() => toggleSource(s.value)}
                      />
                      {s.label}
                    </span>
                    {s.note && (
                      <span
                        className={`text-[11px] font-normal normal-case ${
                          sources.includes(s.value)
                            ? "text-slate-300 dark:text-cyan-300/80"
                            : "text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        {s.note}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Limit per source
              </span>
              <input
                type="number"
                min="1"
                max="50"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="mt-1.5 w-28 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 dark:focus:ring-cyan-900"
              />
            </label>

            <button
              type="submit"
              disabled={
                isSubmitting ||
                (activeRun && !runTimedOut && !["succeeded", "failed", "blocked"].includes(activeRun.status))
              }
              className="ml-auto rounded-2xl bg-slate-950 dark:bg-cyan-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Starting..." : "Run discovery"}
            </button>
          </div>

          {formError && (
            <p className="mt-3 text-sm font-medium text-rose-600 dark:text-rose-400">{formError}</p>
          )}
        </form>

        {activeRun && (
          <div className="mt-6 rounded-[28px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Run #{activeRun.id} — "{activeRun.query}"
                </p>
                {activeRun.createdAt && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Started {formatDateTime(activeRun.createdAt)}
                  </p>
                )}
              </div>
              <RunStatusBadge status={activeRun.status} />
            </div>

            {runTimedOut ? (
              <div className="mt-3 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  No worker picked this up after {Math.round(QUEUED_TIMEOUT_MS / 1000)}s.
                </p>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                  This run is still genuinely queued — it isn't lost, and will resume the moment a
                  worker is running. If this keeps happening, the background worker process
                  (<code className="rounded bg-amber-100 dark:bg-amber-900 px-1">npm run worker</code>,
                  a separate process from the API server) likely isn't running, or can't reach
                  Redis. See the README's "Background Workers" section.
                </p>
              </div>
            ) : (
              ["queued", "running"].includes(activeRun.status) && (
                <p className="mt-3 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />
                  {activeRun.status === "queued" ? "Waiting for a worker..." : "Contacting providers..."}
                </p>
              )
            )}

            <RunResultsSummary run={activeRun} />
          </div>
        )}

        <div className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Recent runs
          </h2>

          <div className="mt-3 rounded-[28px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
            {isLoadingHistory ? (
              <div className="space-y-3 p-5">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : historyError ? (
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Couldn't load discovery history
                </p>
                <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{historyError}</p>
                <button
                  onClick={loadHistory}
                  className="rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:border-slate-300"
                >
                  Try again
                </button>
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No runs yet</p>
                <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">
                  Runs you trigger above will show up here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.map((run) => (
                  <li key={run.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {run.query}
                        {run.location ? ` · ${run.location}` : ""}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {(run.sources || []).join(", ")} · {formatDateTime(run.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <RunStatusBadge status={run.status} />
                      <button
                        type="button"
                        onClick={() => removeRun(run)}
                        disabled={removingRunId === run.id}
                        aria-label={`Remove discovery run "${run.query}" from your history`}
                        title="Remove from history"
                        className="rounded-xl p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-500 dark:hover:bg-rose-950 dark:hover:text-rose-400"
                      >
                        {removingRunId === run.id ? (
                          <span className="block h-4 w-4 animate-pulse rounded-full bg-current opacity-40" />
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-4 w-4"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482 41.03 41.03 0 0 0-2.365-.298V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4Z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default JobDiscovery;
