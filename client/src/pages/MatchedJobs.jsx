import { useEffect, useState } from "react";
import api from "../api";
import Navbar from "../components/Navbar";
import toast from "react-hot-toast";

const STATUS_STYLES = {
  new: "bg-slate-100 text-slate-700",
  matched: "bg-sky-100 text-sky-800",
  applied: "bg-cyan-100 text-cyan-800",
  duplicate: "bg-slate-100 text-slate-500",
};

function scoreStyle(score) {
  if (score >= 70) return "bg-emerald-100 text-emerald-800";
  if (score >= 40) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function MatchedJobs() {
  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 12, total: 0 });
  const [status, setStatus] = useState("");
  const [minScore, setMinScore] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [queuingId, setQueuingId] = useState(null);

  const load = async (page = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (minScore) params.set("minScore", minScore);
      params.set("page", page);
      params.set("pageSize", meta.pageSize);

      const res = await api.get(`/engine/jobs?${params.toString()}`);
      setJobs(res.data?.data || []);
      setMeta((prev) => ({ ...prev, ...res.data?.meta, page }));
    } catch (err) {
      console.error(err);
      toast.error("Failed to load matched jobs");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, minScore]);

  const queueApply = async (jobId) => {
    setQueuingId(jobId);
    try {
      await api.post(`/applications/${jobId}`);
      toast.success("Application queued");
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: "applied" } : j))
      );
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to queue application");
    } finally {
      setQueuingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil((meta.total || 0) / meta.pageSize));

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <span className="inline-flex rounded-full bg-cyan-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-800">
          Engine
        </span>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
          Matched jobs
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Jobs discovered by the scraper and scored against your profile.
          Queue an application straight from here — it hands off to the
          Playwright apply engine.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
          >
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="matched">Matched</option>
            <option value="applied">Applied</option>
            <option value="duplicate">Duplicate</option>
          </select>

          <input
            type="number"
            min="0"
            max="100"
            placeholder="Min match score"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            className="w-44 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
          />

          <button
            onClick={() => load(1)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
          >
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-[24px] bg-slate-100" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="mt-10 flex flex-col items-center justify-center rounded-[28px] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
            <p className="text-sm font-semibold text-slate-700">No jobs found</p>
            <p className="mt-1 max-w-xs text-sm text-slate-500">
              Try loosening your filters, or check back once the scraper has
              run.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => {
              const bestScore = job.match_scores?.[0]?.score;
              return (
                <div
                  key={job.id}
                  className="flex flex-col rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <p className="font-bold text-slate-900">{job.title || "Untitled role"}</p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {[job.companies?.name, job.location, job.remote_type]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {bestScore != null && (
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${scoreStyle(Number(bestScore))}`}
                      >
                        Match {Number(bestScore).toFixed(0)}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        STATUS_STYLES[job.status] || STATUS_STYLES.new
                      }`}
                    >
                      {job.status || "new"}
                    </span>
                  </div>

                  {job.posted_at && (
                    <p className="mt-2 text-xs text-slate-400">
                      Posted {formatDate(job.posted_at)}
                    </p>
                  )}

                  <div className="mt-4 flex items-center gap-2">
                    {job.source_url && (
                      <a
                        href={job.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-cyan-700 hover:underline"
                      >
                        View posting ↗
                      </a>
                    )}
                    <button
                      onClick={() => queueApply(job.id)}
                      disabled={queuingId === job.id || job.status === "applied"}
                      className="ml-auto rounded-xl bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                    >
                      {job.status === "applied"
                        ? "Queued ✓"
                        : queuingId === job.id
                        ? "Queuing..."
                        : "Queue apply"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && jobs.length > 0 && (
          <div className="mt-8 flex items-center justify-center gap-4">
            <button
              onClick={() => load(meta.page - 1)}
              disabled={meta.page <= 1}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="text-sm font-semibold text-slate-500">
              Page {meta.page} of {totalPages}
            </span>
            <button
              onClick={() => load(meta.page + 1)}
              disabled={meta.page >= totalPages}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default MatchedJobs;
