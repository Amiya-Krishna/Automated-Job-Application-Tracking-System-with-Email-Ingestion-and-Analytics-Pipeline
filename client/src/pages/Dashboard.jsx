import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import Navbar from "../components/Navbar";
import toast from "react-hot-toast";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const STATUS_STYLES = {
  Applied: { badge: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  Interview: { badge: "bg-blue-100 text-blue-800", dot: "bg-blue-500" },
  Offer: { badge: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  Rejected: { badge: "bg-rose-100 text-rose-800", dot: "bg-rose-500" },
};

const COLORS = { Applied: "#F59E0B", Interview: "#3B82F6", Offer: "#10B981", Rejected: "#F43F5E" };

function Dashboard() {
  const navigate = useNavigate();

  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("newest");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    const loadJobs = async () => {
      try {
        setIsLoading(true);
        const res = await api.get("/jobs");
        setJobs(res.data);
      } catch (err) {
        console.error(err);
        toast.error("Failed to fetch jobs");
      } finally {
        setIsLoading(false);
      }
    };

    loadJobs();
  }, []);

  const deleteJob = async (id) => {
    try {
      await api.delete(`/jobs/${id}`);
      setJobs((prev) => prev.filter((job) => job._id !== id));
      toast.success("Job deleted");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete job");
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/jobs/${id}`, { status });
      setJobs((prev) =>
        prev.map((job) => (job._id === id ? { ...job, status } : job))
      );
      toast.success("Status updated");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
    }
  };

  const analytics = useMemo(
    () => ({
      total: jobs.length,
      applied: jobs.filter((j) => j.status === "Applied").length,
      interview: jobs.filter((j) => j.status === "Interview").length,
      offer: jobs.filter((j) => j.status === "Offer").length,
      rejected: jobs.filter((j) => j.status === "Rejected").length,
    }),
    [jobs]
  );

  const filteredJobs = useMemo(() => {
    const filtered = jobs.filter((job) => {
      const matchesSearch =
        (job.company || "").toLowerCase().includes(search.toLowerCase()) ||
        (job.role || "").toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "All" || job.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    const sorted = [...filtered];

    if (sortBy === "newest") {
      sorted.sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );
    } else if (sortBy === "oldest") {
      sorted.sort(
        (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
      );
    } else if (sortBy === "company") {
      sorted.sort((a, b) => (a.company || "").localeCompare(b.company || ""));
    }

    return sorted;
  }, [jobs, search, statusFilter, sortBy]);

  const chartData = [
    { name: "Applied", value: analytics.applied },
    { name: "Interview", value: analytics.interview },
    { name: "Offer", value: analytics.offer },
    { name: "Rejected", value: analytics.rejected },
  ].filter((d) => d.value > 0);

  const exportCsv = () => {
    if (jobs.length === 0) {
      toast.error("No jobs to export yet");
      return;
    }

    const header = ["Company", "Role", "Status", "Interview Date", "Notes"];
    const rows = jobs.map((job) => [
      job.company,
      job.role,
      job.status,
      job.interviewDate || "",
      (job.notes || "").replace(/\n/g, " "),
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "job-applications.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* HEADER */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
              Your pipeline
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {analytics.total === 0
                ? "Nothing tracked yet — add your first application below."
                : `Tracking ${analytics.total} application${analytics.total === 1 ? "" : "s"} across your search.`}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={exportCsv}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
            >
              Export CSV
            </button>
            <button
              onClick={() => navigate("/add-job")}
              className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              + Add Job
            </button>
          </div>
        </div>

        {/* ANALYTICS CARDS */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard title="Total" value={analytics.total} accent="text-slate-900" />
          <StatCard title="Applied" value={analytics.applied} accent="text-amber-600" />
          <StatCard title="Interview" value={analytics.interview} accent="text-blue-600" />
          <StatCard title="Offer" value={analytics.offer} accent="text-emerald-600" />
          <StatCard title="Rejected" value={analytics.rejected} accent="text-rose-600" />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          {/* TABLE */}
          <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center">
              <input
                type="text"
                placeholder="Search company or role..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <select
                className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">All Status</option>
                <option value="Applied">Applied</option>
                <option value="Interview">Interview</option>
                <option value="Offer">Offer</option>
                <option value="Rejected">Rejected</option>
              </select>

              <select
                className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="company">Company A–Z</option>
              </select>
            </div>

            {isLoading ? (
              <div className="space-y-3 p-5">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <p className="text-sm font-semibold text-slate-700">
                  {jobs.length === 0 ? "No applications yet" : "No matches found"}
                </p>
                <p className="mt-1 max-w-xs text-sm text-slate-500">
                  {jobs.length === 0
                    ? "Start tracking your job search by adding your first application."
                    : "Try adjusting your search or filter."}
                </p>
                {jobs.length === 0 && (
                  <button
                    onClick={() => navigate("/add-job")}
                    className="mt-4 rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Add your first job
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3">Company</th>
                      <th className="px-5 py-3">Role</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobs.map((job) => {
                      const style = STATUS_STYLES[job.status] || STATUS_STYLES.Applied;
                      return (
                        <tr key={job._id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                          <td className="px-5 py-3.5 font-semibold text-slate-900">
                            {job.company}
                          </td>
                          <td className="px-5 py-3.5 text-slate-600">{job.role}</td>
                          <td className="px-5 py-3.5">
                            <select
                              value={job.status}
                              onChange={(e) => updateStatus(job._id, e.target.value)}
                              className={`rounded-full border-0 px-3 py-1 text-xs font-semibold outline-none ${style.badge}`}
                            >
                              <option value="Applied">Applied</option>
                              <option value="Interview">Interview</option>
                              <option value="Offer">Offer</option>
                              <option value="Rejected">Rejected</option>
                            </select>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() =>
                                  navigate(`/edit-job/${job._id}`, { state: { job } })
                                }
                                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
                              >
                                Edit
                              </button>

                              {confirmDeleteId === job._id ? (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => deleteJob(job._id)}
                                    className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteId(job._id)}
                                  className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* CHART */}
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Breakdown</h2>
            <p className="text-sm text-slate-500">Where your applications currently stand.</p>

            <div className="mt-4 h-72">
              {chartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  Add jobs to see your analytics
                </div>
              ) : (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {chartData.map((entry) => (
                        <Cell key={entry.name} fill={COLORS[entry.name]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, accent }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <p className={`mt-2 text-2xl font-black sm:text-3xl ${accent}`}>{value}</p>
    </div>
  );
}

export default Dashboard;
