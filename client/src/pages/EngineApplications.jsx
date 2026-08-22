import { useEffect, useState } from "react";
import api from "../api";
import Navbar from "../components/Navbar";
import toast from "react-hot-toast";

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  applied: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
  interview: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  offer: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

const STATUS_FILTERS = ["", "pending", "applied", "interview", "offer", "rejected"];

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EngineApplications() {
  const [applications, setApplications] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : "";
      const res = await api.get(`/applications${params}`);
      setApplications(res.data?.data || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load applications");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const submit = async (id) => {
    setBusyId(id);
    try {
      await api.post(`/applications/${id}/submit`);
      toast.success("Marked as applied");
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update");
    } finally {
      setBusyId(null);
    }
  };

  const recordOutcome = async (id, status) => {
    setBusyId(id);
    try {
      await api.post(`/applications/${id}/outcome`, { status });
      toast.success(`Marked as ${status}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Navbar />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <span className="inline-flex rounded-full bg-cyan-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-800">
          Engine
        </span>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
          Applications
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
          Applications queued or submitted by the apply engine, with their
          outcomes — separate from the jobs you add manually on the
          dashboard.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s || "all"}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition ${
                statusFilter === s
                  ? "bg-slate-950 text-white"
                  : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300"
              }`}
            >
              {s || "All"}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="mt-6 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : applications.length === 0 ? (
          <div className="mt-10 flex flex-col items-center justify-center rounded-[28px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-16 text-center shadow-sm">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No applications yet</p>
            <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">
              Queue one from the Matched Jobs page and it'll show up here.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {applications.map((app) => (
              <div
                key={app.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 dark:text-slate-100">
                    {app.jobs?.title || `Job #${app.job_id}`}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {app.jobs?.companies?.name || "Unknown company"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${
                        STATUS_STYLES[app.status] || "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {app.status}
                    </span>
                    {app.applied_at && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        Applied {formatDateTime(app.applied_at)}
                      </span>
                    )}
                    {app.failure_reason && (
                      <span className="text-xs font-semibold text-rose-600">
                        {app.failure_reason}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {app.status === "pending" && (
                    <button
                      onClick={() => submit(app.id)}
                      disabled={busyId === app.id}
                      className="rounded-xl bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                    >
                      Mark applied
                    </button>
                  )}
                  {app.status === "applied" && (
                    <>
                      <button
                        onClick={() => recordOutcome(app.id, "interview")}
                        disabled={busyId === app.id}
                        className="rounded-xl border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50"
                      >
                        Interview
                      </button>
                      <button
                        onClick={() => recordOutcome(app.id, "offer")}
                        disabled={busyId === app.id}
                        className="rounded-xl border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                      >
                        Offer
                      </button>
                      <button
                        onClick={() => recordOutcome(app.id, "rejected")}
                        disabled={busyId === app.id}
                        className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                      >
                        Rejected
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default EngineApplications;
