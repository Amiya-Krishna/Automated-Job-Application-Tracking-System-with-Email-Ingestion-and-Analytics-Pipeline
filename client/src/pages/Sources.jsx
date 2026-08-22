import { useEffect, useState } from "react";
import api from "../api";
import Navbar from "../components/Navbar";
import toast from "react-hot-toast";

function Sources() {
  const [sources, setSources] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/sources");
        setSources(res.data?.data || []);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load sources");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const maxJobs = Math.max(1, ...sources.map((s) => s.jobCount || 0));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Navbar />

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <span className="inline-flex rounded-full bg-cyan-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-800">
          Engine
        </span>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
          Job sources
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
          Where the scraper pulls listings from, and how many jobs each one
          has contributed.
        </p>

        <div className="mt-6 rounded-[28px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : sources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No sources yet</p>
              <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">
                Sources appear here as soon as the scraper ingests its first
                job.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {sources.map((s) => (
                <div key={s.id}>
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-bold capitalize text-slate-900 dark:text-slate-100">{s.name}</p>
                      {s.baseUrl && (
                        <a
                          href={s.baseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-cyan-700 hover:underline"
                        >
                          {s.baseUrl}
                        </a>
                      )}
                    </div>
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-200">
                      {s.jobCount} jobs
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-700"
                      style={{ width: `${((s.jobCount || 0) / maxJobs) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Sources;
