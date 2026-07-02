import { useEffect, useState, useMemo } from "react";
import api from "../api";
import Navbar from "../components/Navbar";
import toast from "react-hot-toast";
import { getStoredToken } from "../utils/auth";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

function Dashboard() {

  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const token = getStoredToken();

  // AUTH CHECK + LOAD
  useEffect(() => {
    const loadJobs = async () => {
      try {
        const res = await api.get("/jobs", {
          headers: { token },
        });

        setJobs(res.data);
      } catch (err) {
        console.error(err);
        toast.error("Failed to fetch jobs");
      }
    };

    if (!token) {
      window.location.href = "/login";
      return;
    }

    loadJobs();
  }, [token]);

  // DELETE JOB
  const deleteJob = async (id) => {
    try {
      await api.delete(`/jobs/${id}`, {
        headers: { token },
      });

      setJobs((prev) => prev.filter((job) => job._id !== id));
      toast.success("Job deleted");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete job");
    }
  };

  // UPDATE STATUS
  const updateStatus = async (id, status) => {
    try {
      await api.put(
        `/jobs/${id}`,
        { status },
        { headers: { token } }
      );

      setJobs((prev) =>
        prev.map((job) =>
          job._id === id ? { ...job, status } : job
        )
      );

      toast.success("Status updated");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
    }
  };

  // ANALYTICS
  const analytics = useMemo(() => ({
    total: jobs.length,
    applied: jobs.filter((j) => j.status === "Applied").length,
    interview: jobs.filter((j) => j.status === "Interview").length,
    offer: jobs.filter((j) => j.status === "Offer").length,
    rejected: jobs.filter((j) => j.status === "Rejected").length,
  }), [jobs]);

  // FILTERED JOBS
  const filteredJobs = jobs.filter((job) => {

    const matchesSearch = (job.company || "")
      .toLowerCase()
      .includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "All" || job.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // CHART DATA
  const chartData = [
    { name: "Applied", value: analytics.applied },
    { name: "Interview", value: analytics.interview },
    { name: "Offer", value: analytics.offer },
    { name: "Rejected", value: analytics.rejected },
  ];

  const COLORS = ["#EAB308", "#3B82F6", "#22C55E", "#EF4444"];

  return (
    <>
      <Navbar />

      <div className="min-h-screen bg-gray-100 p-6">

        {/* HEADER */}
        <div className="flex justify-between items-center mb-6">

          <h1 className="text-3xl font-bold text-blue-600">
            Job Dashboard
          </h1>

          <a
            href="/add-job"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Add Job
          </a>

        </div>

        {/* ANALYTICS CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">

          <Card title="Total" value={analytics.total} color="text-blue-600" />
          <Card title="Applied" value={analytics.applied} color="text-yellow-500" />
          <Card title="Interview" value={analytics.interview} color="text-blue-500" />
          <Card title="Offer" value={analytics.offer} color="text-green-500" />
          <Card title="Rejected" value={analytics.rejected} color="text-red-500" />

        </div>

        {/* CHART */}
        <div className="bg-white p-6 rounded-xl shadow mb-6">

          <h2 className="text-2xl font-bold mb-4 text-blue-600">
            Application Analytics
          </h2>

          <div className="w-full h-[400px]">

            <ResponsiveContainer>
              <PieChart>

                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={130}
                  dataKey="value"
                  label
                >
                  {chartData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index]} />
                  ))}
                </Pie>

                <Tooltip />
                <Legend />

              </PieChart>
            </ResponsiveContainer>

          </div>

        </div>

        {/* SEARCH + FILTER */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">

          <input
            type="text"
            placeholder="Search Company..."
            className="border p-3 rounded w-full bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="border p-3 rounded bg-white"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >

            <option value="All">All Status</option>
            <option value="Applied">Applied</option>
            <option value="Interview">Interview</option>
            <option value="Offer">Offer</option>
            <option value="Rejected">Rejected</option>

          </select>

        </div>

        {/* TABLE */}
        <div className="bg-white shadow rounded-xl overflow-hidden">

          <table className="w-full">

            <thead className="bg-blue-600 text-white">
              <tr>
                <th className="p-4">Company</th>
                <th>Role</th>
                <th>Status</th>
                <th>Update</th>
                <th>Delete</th>
              </tr>
            </thead>

            <tbody>

              {filteredJobs.length > 0 ? (

                filteredJobs.map((job) => (

                  <tr key={job._id} className="text-center border-b">

                    <td className="p-4">{job.company}</td>
                    <td>{job.role}</td>

                    <td>
                      <span
                        className={`px-3 py-1 rounded-full text-white text-sm
                        ${job.status === "Applied" && "bg-yellow-500"}
                        ${job.status === "Interview" && "bg-blue-500"}
                        ${job.status === "Offer" && "bg-green-500"}
                        ${job.status === "Rejected" && "bg-red-500"}
                        `}
                      >
                        {job.status}
                      </span>
                    </td>

                    <td>
                      <select
                        className="border p-1 rounded"
                        value={job.status}
                        onChange={(e) =>
                          updateStatus(job._id, e.target.value)
                        }
                      >
                        <option value="Applied">Applied</option>
                        <option value="Interview">Interview</option>
                        <option value="Offer">Offer</option>
                        <option value="Rejected">Rejected</option>
                      </select>
                    </td>

                    <td>
                      <button
                        onClick={() => deleteJob(job._id)}
                        className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                      >
                        Delete
                      </button>
                    </td>

                  </tr>

                ))

              ) : (

                <tr>
                  <td colSpan="5" className="text-center p-6 text-gray-500">
                    No Jobs Found
                  </td>
                </tr>

              )}

            </tbody>

          </table>

        </div>

      </div>
    </>
  );
}

// CARD COMPONENT
function Card({ title, value, color }) {
  return (
    <div className="bg-white p-5 rounded-xl shadow">
      <h2 className="text-gray-500">{title}</h2>
      <p className={`text-3xl font-bold mt-2 ${color}`}>{value}</p>
    </div>
  );
}

export default Dashboard;
