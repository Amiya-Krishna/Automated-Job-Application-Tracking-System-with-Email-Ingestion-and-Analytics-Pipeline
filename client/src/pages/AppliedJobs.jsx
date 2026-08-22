import { useEffect, useMemo, useState } from "react";
import api from "../api";
import Navbar from "../components/Navbar";
import toast from "react-hot-toast";

// GET /api/jobs/applied — see server/services/appliedJobsService.js for
// exactly how this is assembled (tracked_jobs is already the unified
// table for manual/extension/gmail; the automated apply-engine's own
// status is merged in per-row, never as a duplicate).
const STATUS_OPTIONS = ["Applied", "Interview", "Offer", "Rejected"];
const SOURCE_LABELS = {
  manual: "Manual",
  extension: "Extension",
  gmail: "Gmail",
};

const STATUS_STYLES = {
  Applied: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  Interview: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  Offer: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  Rejected: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

const SOURCE_STYLES = {
  manual: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  extension: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  gmail: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

function scoreStyle(score) {
  if (score === null || score === undefined) return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
  if (score >= 70) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
  if (score >= 40) return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function AppliedJobs() {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [sortBy, setSortBy] = useState("date-desc");

  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const res = await api.get("/jobs/applied");
      setJobs(res.data?.data || []);
    } catch (err) {
      setLoadError(err.response?.data?.message || "Failed to load applied jobs");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Same pattern already used throughout this codebase (MatchedJobs.jsx,
    // EngineApplications.jsx, etc.) for the initial data load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const availableSources = useMemo(() => {
    const set = new Set(jobs.map((j) => j.source));
    return Array.from(set);
  }, [jobs]);

  const visibleJobs = useMemo(() => {
    let list = jobs;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (j) =>
          j.title?.toLowerCase().includes(q) ||
          j.company?.toLowerCase().includes(q) ||
          j.location?.toLowerCase().includes(q),
      );
    }
    if (statusFilter) list = list.filter((j) => j.status === statusFilter);
    if (sourceFilter) list = list.filter((j) => j.source === sourceFilter);

    const sorted = [...list];
    if (sortBy === "date-desc") {
      sorted.sort((a, b) => new Date(b.appliedDate) - new Date(a.appliedDate));
    } else if (sortBy === "date-asc") {
      sorted.sort((a, b) => new Date(a.appliedDate) - new Date(b.appliedDate));
    } else if (sortBy === "score-desc") {
      sorted.sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1));
    } else if (sortBy === "company") {
      sorted.sort((a, b) => (a.company || "").localeCompare(b.company || ""));
    }
    return sorted;
  }, [jobs, search, statusFilter, sourceFilter, sortBy]);

  const updateStatus = async (job, status) => {
    setSavingId(job.trackedJobId);
    const prev = jobs;
    setJobs((cur) => cur.map((j) => (j.trackedJobId === job.trackedJobId ? { ...j, status } : j)));
    try {
      await api.put(`/jobs/${job.trackedJobId}`, { status });
    } catch (err) {
      setJobs(prev);
      toast.error(err.response?.data?.message || "Failed to update status");
    } finally {
      setSavingId(null);
    }
  };

  const removeJob = async (job) => {
    if (!window.confirm(`Remove ${job.title} at ${job.company}?`)) return;
    setDeletingId(job.trackedJobId);
    try {
      await api.delete(`/jobs/${job.trackedJobId}`);
      setJobs((cur) => cur.filter((j) => j.trackedJobId !== job.trackedJobId));
      toast.success("Removed");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to remove job");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Navbar />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <span className="inline-flex rounded-full bg-cyan-100 dark:bg-cyan-950 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-800 dark:text-cyan-300">
          Applications
        </span>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
          Applied jobs
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
          Every job you've tracked, however it got here — added by hand, saved
          from the browser extension, or imported from Gmail — in one place.
        </p>

        <div className="mt-6 flex flex-wrap gap-3 rounded-[28px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, company, or location"
            className="min-w-[220px] flex-1 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 dark:focus:ring-cyan-900"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-500"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-500"
          >
            <option value="">All sources</option>
            {availableSources.map((s) => (
              <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-500"
          >
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="score-desc">Best match first</option>
            <option value="company">Company A–Z</option>
          </select>
        </div>

        <div className="mt-4 overflow-hidden rounded-[28px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
          {isLoading ? (
            <div className="space-y-3 p-5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Couldn't load applied jobs
              </p>
              <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{loadError}</p>
              <button
                onClick={load}
                className="rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:border-slate-300"
              >
                Try again
              </button>
            </div>
          ) : visibleJobs.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-6 py-14 text-center">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {jobs.length === 0 ? "No applied jobs yet" : "Nothing matches those filters"}
              </p>
              <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">
                {jobs.length === 0
                  ? "Add one manually, save one from the browser extension, or import from Gmail."
                  : "Try clearing the search or filters."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Company</th>
                    <th className="px-5 py-3">Location</th>
                    <th className="px-5 py-3">Source</th>
                    <th className="px-5 py-3">Applied</th>
                    <th className="px-5 py-3">Match</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleJobs.map((job) => (
                    <tr key={job.id} className="align-top">
                      <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-slate-100">
                        {job.sourceUrl ? (
                          <a
                            href={job.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-cyan-700 dark:hover:text-cyan-400 hover:underline"
                          >
                            {job.title}
                          </a>
                        ) : (
                          job.title
                        )}
                        {job.engineApplicationStatus && (
                          <span className="ml-2 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                            engine: {job.engineApplicationStatus}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-700 dark:text-slate-300">{job.company}</td>
                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{job.location || "—"}</td>
                      <td className="px-5 py-3.5">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${SOURCE_STYLES[job.source] || SOURCE_STYLES.manual}`}>
                          {SOURCE_LABELS[job.source] || job.source}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{formatDate(job.appliedDate)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${scoreStyle(job.matchScore)}`}>
                          {job.matchScore !== null && job.matchScore !== undefined ? `${Math.round(job.matchScore)}%` : "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <select
                          value={job.status}
                          disabled={savingId === job.trackedJobId}
                          onChange={(e) => updateStatus(job, e.target.value)}
                          className={`rounded-full border-0 px-2.5 py-1 text-xs font-bold outline-none disabled:opacity-60 ${STATUS_STYLES[job.status] || STATUS_STYLES.Applied}`}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => removeJob(job)}
                          disabled={deletingId === job.trackedJobId}
                          className="text-xs font-semibold text-rose-600 dark:text-rose-400 transition hover:underline disabled:opacity-60"
                        >
                          {deletingId === job.trackedJobId ? "Removing..." : "Remove"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AppliedJobs;
