import { useCallback, useEffect, useState } from "react";
import api from "../api";
import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import AdminDeleteButton from "../components/AdminDeleteButton";

// One page, two audiences - decided by the SERVER (GET /api/sources):
//   users  -> Manual, Gmail, Extension with their own jobs only
//   admins -> the fetched sources (LinkedIn, Naukri, Remotive, Unstop, Indeed, Wellfound,
//             Internshala) with the shared catalog jobs
// The page just renders what it is given; it never filters or decides visibility itself.
const LABEL = { manual: "Manual", gmail: "Gmail", extension: "Browser extension", linkedin: "LinkedIn", naukri: "Naukri", remotive: "Remotive", unstop: "Unstop", indeed: "Indeed", wellfound: "Wellfound", internshala: "Internshala" };
const label = (name) => LABEL[String(name).toLowerCase()] || name;

function SourceRows({ source }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let live = true;
    api.get(`/sources/${source.id}`)
      .then((res) => {
        if (!live) return;
        const d = res.data?.data || {};
        setRows((d.trackedJobs || d.jobs || []).map((j) => ({
          id: j.id,
          title: j.role || j.title,
          company: j.company || j.companies?.name || "",
          status: j.status,
          url: j.sourceUrl || j.source_url,
        })));
      })
      .catch(() => live && setRows([]));
    return () => { live = false; };
  }, [source.id]);

  if (rows === null) return <p className="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">Loading…</p>;
  if (rows.length === 0) return <p className="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">No jobs yet.</p>;
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
          <span className="min-w-0">
            <span className="block truncate font-semibold text-slate-900 dark:text-slate-100">{r.title}</span>
            <span className="block truncate text-slate-500 dark:text-slate-400">{r.company}</span>
          </span>
          {r.status && <span className="shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300">{r.status}</span>}
        </li>
      ))}
    </ul>
  );
}

function Sources() {
  const { isAdmin } = useAuth(false);
  const [sources, setSources] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get("/sources");
      setSources(res.data?.data || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load sources");
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">Sources</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
          {isAdmin
            ? "The job boards you fetch from. These jobs are shared with every user."
            : "Where your own jobs came from. Only you can see these."}
        </p>

        <div className="mt-6 space-y-3">
          {isLoading ? (
            [...Array(3)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />)
          ) : sources.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-center text-sm text-slate-500 dark:text-slate-400">No sources to show.</p>
          ) : (
            sources.map((s) => (
              <div key={s.id} className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                <div className="flex items-center justify-between gap-3 p-4">
                  <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id} className="min-w-0 flex-1 text-left">
                    <span className="block truncate font-bold text-slate-900 dark:text-slate-100">{label(s.name)}</span>
                    {isAdmin && s.baseUrl && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{s.baseUrl}</span>}
                  </button>
                  <span className="shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-200">
                    {s.jobCount} {s.jobCount === 1 ? "job" : "jobs"}
                  </span>
                  <AdminDeleteButton kind="sources" id={s.id} label={label(s.name)} hasJobs={(s.jobCount || 0) > 0} onDeleted={load} />
                </div>
                {open === s.id && <div className="border-t border-slate-100 dark:border-slate-800"><SourceRows source={s} /></div>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default Sources;
