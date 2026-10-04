import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import Navbar from "../components/Navbar";
import toast from "react-hot-toast";
import { safeWebUrl } from "../utils/links";

// GET /api/jobs/applied — see server/services/appliedJobsService.js for
// exactly how this is assembled (tracked_jobs is already the unified
// table for manual/extension/gmail; the automated apply-engine's own
// status is merged in per-row, never as a duplicate).
const STATUS_OPTIONS = ["Applied", "Interview", "Offer", "Rejected"];
const SOURCE_LABELS = {
  manual: "Manual",
  extension: "Extension",
  gmail: "Gmail",
  linkedin: "LinkedIn",
  indeed: "Indeed",
  naukri: "Naukri",
  internshala: "Internshala",
  wellfound: "Wellfound",
  unstop: "Unstop",
  engine: "Engine",
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
  // Added alongside the Engine Job → Applied Jobs fix: applying to an
  // Engine Job now creates a TrackedJob whose sourceName is the engine
  // job's actual source (linkedin/indeed) or "engine" as a fallback, so
  // these badges are now genuinely reachable here for the first time —
  // matches the same palette StateViews.jsx's SourceBadge already uses.
  linkedin: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  indeed: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  naukri: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  internshala: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  wellfound: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  unstop: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300",
  engine: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
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

        <div className="mt-6 flex flex-col gap-3 rounded-[28px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:flex-row sm:flex-wrap">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, company, or location"
            className="min-h-[44px] w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 dark:focus:ring-cyan-900 sm:min-w-[220px] sm:flex-1"
          />
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-[44px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 sm:px-4 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-500"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="min-h-[44px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 sm:px-4 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-500"
            >
              <option value="">All sources</option>
              {availableSources.map((s) => (
                <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="col-span-2 min-h-[44px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 sm:px-4 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-500 sm:col-span-1"
            >
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="score-desc">Best match first</option>
              <option value="company">Company A–Z</option>
            </select>
          </div>
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
            <>
              {/* Mobile: card list */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
                {visibleJobs.map((job) => (
                  <div key={job.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {safeWebUrl(job.sourceUrl) ? (
                          <a
                            href={safeWebUrl(job.sourceUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-slate-900 dark:text-slate-100 hover:text-cyan-700 dark:hover:text-cyan-400 hover:underline"
                          >
                            {job.title}
                          </a>
                        ) : (
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{job.title}</p>
                        )}
                        <p className="text-sm text-slate-600 dark:text-slate-300">{job.company}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{job.location || "—"}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${scoreStyle(job.matchScore)}`}>
                        {job.matchScore !== null && job.matchScore !== undefined ? `${Math.round(job.matchScore)}%` : "—"}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${SOURCE_STYLES[job.source] || SOURCE_STYLES.manual}`}>
                        {SOURCE_LABELS[job.source] || job.source}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">Applied {formatDate(job.appliedDate)}</span>
                      {job.engineApplicationStatus && (
                        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                          engine: {job.engineApplicationStatus}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <select
                        value={job.status}
                        disabled={savingId === job.trackedJobId}
                        onChange={(e) => updateStatus(job, e.target.value)}
                        className={`min-h-[40px] flex-1 rounded-xl border-0 px-3 text-sm font-bold outline-none disabled:opacity-60 ${STATUS_STYLES[job.status] || STATUS_STYLES.Applied}`}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="tt-actions tt-actions--stretch mt-2">
                      <Link to={`/tailor?job=tracked-${job.trackedJobId}`} className="tt-btn tt-btn--primary">
                        Tailor Resume
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeJob(job)}
                        disabled={deletingId === job.trackedJobId}
                        className="tt-btn tt-btn--danger"
                      >
                        {deletingId === job.trackedJobId ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden overflow-x-auto md:block">
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
                        {safeWebUrl(job.sourceUrl) ? (
                          <a
                            href={safeWebUrl(job.sourceUrl)}
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
                      <td className="px-5 py-3.5">
                        <div className="tt-actions">
                          {safeWebUrl(job.sourceUrl) && (
                            <a href={safeWebUrl(job.sourceUrl)} target="_blank" rel="noopener noreferrer" className="tt-btn tt-btn--primary" title="Open the original posting">
                              View ↗
                            </a>
                          )}
                          <Link to={`/tailor?job=tracked-${job.trackedJobId}`} className="tt-btn tt-btn--primary">
                            Tailor Resume
                          </Link>
                          <button
                            type="button"
                            onClick={() => removeJob(job)}
                            disabled={deletingId === job.trackedJobId}
                            className="tt-btn tt-btn--danger"
                          >
                            {deletingId === job.trackedJobId ? "Removing..." : "Remove"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AppliedJobs;
