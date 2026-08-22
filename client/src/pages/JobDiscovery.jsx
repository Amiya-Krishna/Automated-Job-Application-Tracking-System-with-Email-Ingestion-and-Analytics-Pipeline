import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import Navbar from "../components/Navbar";
import toast from "react-hot-toast";

// Matches the real backend contract in server/routes/scrapeRoutes.js —
// nothing here is invented. POST /api/scrape/run body:
//   { query, location, sources: ["linkedin","indeed"], limit }
// -> { status: "queued", runId, sources }
// GET /api/scrape/runs/:id -> { data: ScrapeRun }
//   ScrapeRun.status: queued | running | succeeded | failed | blocked
//   ScrapeRun.results: { [sourceName]: { status, message, found, ingested } }
const SOURCES = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "indeed", label: "Indeed" },
];

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
  const [sources, setSources] = useState(["linkedin", "indeed"]);
  const [limit, setLimit] = useState(25);

  const [activeRun, setActiveRun] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [history, setHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState("");

  const pollRef = useRef(null);

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
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/scrape/runs/${runId}`);
        const run = res.data?.data;
        if (!run) return;
        setActiveRun(run);

        if (["succeeded", "failed", "blocked"].includes(run.status)) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          loadHistory();

          if (run.status === "succeeded") {
            toast.success("Discovery run finished");
          } else if (run.status === "blocked") {
            toast("Providers were unavailable — no jobs imported.", { icon: "⚠️" });
          } else {
            toast.error("Discovery run failed");
          }
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
          Trigger a discovery run against LinkedIn and Indeed. Results are only
          ever real listings a provider actually returned — if a provider
          can't be reached compliantly, this page says so instead of faking
          results. See{" "}
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
              <div className="mt-1.5 flex gap-2">
                {SOURCES.map((s) => (
                  <label
                    key={s.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                      sources.includes(s.value)
                        ? "border-slate-950 dark:border-cyan-500 bg-slate-950 dark:bg-cyan-950 text-white dark:text-cyan-200"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={sources.includes(s.value)}
                      onChange={() => toggleSource(s.value)}
                    />
                    {s.label}
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
              disabled={isSubmitting || (activeRun && !["succeeded", "failed", "blocked"].includes(activeRun.status))}
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

            {["queued", "running"].includes(activeRun.status) && (
              <p className="mt-3 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />
                {activeRun.status === "queued" ? "Waiting for a worker..." : "Contacting providers..."}
              </p>
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
                    <RunStatusBadge status={run.status} />
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
