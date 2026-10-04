import { useCallback, useEffect, useState } from "react";
import api from "../api";
import Navbar from "../components/Navbar";
import AdminDeleteButton from "../components/AdminDeleteButton";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

const card = "rounded-[24px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm";

function Stat({ label, value }) {
  return (
    <div className={card}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{value ?? "—"}</p>
    </div>
  );
}

// Admin panel. Route access is guarded by <AdminRoute>, and every endpoint used
// here (/api/admin/*) is enforced server-side by requireAdmin.
function Admin() {
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [sources, setSources] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [o, u, s, c] = await Promise.all([
        api.get("/admin/overview"),
        api.get("/admin/users"),
        api.get("/sources"),
        api.get("/companies?pageSize=100"),
      ]);
      setOverview(o.data?.data || null);
      setUsers(u.data?.data || []);
      setSources(s.data?.data || []);
      setCompanies(c.data?.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load admin data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeRole = async (target, role) => {
    setSavingId(target.id);
    try {
      const res = await api.patch(`/admin/users/${target.id}/role`, { role });
      setUsers((prev) => prev.map((x) => (x.id === target.id ? { ...x, role: res.data?.data?.role || role } : x)));
      toast.success(`${target.email} is now ${role}`);
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not change role");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <span className="inline-flex rounded-full bg-rose-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-rose-800">Admin</span>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">Admin panel</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
          Manage accounts and the shared job catalog. Job Discovery is also admin-only.
          Matched jobs are deleted from the Matched Jobs page.
        </p>

        {isLoading ? (
          <div className="mt-6 h-40 animate-pulse rounded-[24px] bg-slate-100 dark:bg-slate-800" />
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Users" value={overview?.users} />
              <Stat label="Admins" value={overview?.admins} />
              <Stat label="Jobs" value={overview?.jobs} />
              <Stat label="Companies" value={overview?.companies} />
              <Stat label="Sources" value={overview?.sources} />
              <Stat label="Discovery runs" value={overview?.discoveryRuns} />
            </div>

            <section className={`${card} mt-6`}>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Users &amp; roles</h2>
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {users.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{u.name || u.email}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${u.role === "admin" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>{u.role}</span>
                      {u.id !== user?.id && (
                        <button
                          type="button"
                          disabled={savingId === u.id}
                          onClick={() => changeRole(u, u.role === "admin" ? "user" : "admin")}
                          className="tt-btn tt-btn--primary"
                        >
                          {u.role === "admin" ? "Make user" : "Make admin"}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className={card}>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Sources</h2>
                <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                  {sources.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="truncate text-sm font-semibold capitalize text-slate-800 dark:text-slate-200">{s.name} <span className="font-normal text-slate-400">· {s.jobCount} jobs</span></span>
                      <AdminDeleteButton kind="sources" id={s.id} label={s.name} hasJobs={(s.jobCount || 0) > 0} onDeleted={() => load()} />
                    </li>
                  ))}
                </ul>
              </section>
              <section className={card}>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Companies</h2>
                <ul className="mt-3 max-h-96 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                  {companies.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{c.name} <span className="font-normal text-slate-400">· {c.jobCount} jobs</span></span>
                      <AdminDeleteButton kind="companies" id={c.id} label={c.name} hasJobs={(c.jobCount || 0) > 0} onDeleted={() => load()} />
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Admin;
