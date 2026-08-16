import { useEffect, useState } from "react";
import api from "../api";
import Navbar from "../components/Navbar";
import toast from "react-hot-toast";

function Companies() {
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [meta, setMeta] = useState({ total: 0 });

  useEffect(() => {
    const timeout = setTimeout(async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ pageSize: "50" });
        if (search) params.set("search", search);
        const res = await api.get(`/companies?${params.toString()}`);
        setCompanies(res.data?.data || []);
        setMeta(res.data?.meta || { total: 0 });
      } catch (err) {
        console.error(err);
        toast.error("Failed to load companies");
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [search]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <span className="inline-flex rounded-full bg-cyan-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-800">
          Engine
        </span>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
          Companies
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Employers deduplicated by the ingestion pipeline, and how many
          jobs of theirs have been scraped so far.
        </p>

        <input
          type="text"
          placeholder="Search by company name or domain..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-6 w-full max-w-md rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
        />

        <div className="mt-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          {isLoading ? (
            <div className="space-y-3 p-5">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : companies.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <p className="text-sm font-semibold text-slate-700">No companies found</p>
              <p className="mt-1 max-w-xs text-sm text-slate-500">
                They'll appear here once the scraper has ingested some jobs.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3">Company</th>
                    <th className="px-5 py-3">Domain</th>
                    <th className="px-5 py-3 text-right">Jobs scraped</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60"
                    >
                      <td className="px-5 py-3.5 font-semibold text-slate-900">{c.name}</td>
                      <td className="px-5 py-3.5 text-slate-500">{c.domain || "—"}</td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                          {c.jobCount}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!isLoading && companies.length > 0 && (
          <p className="mt-3 text-xs font-semibold text-slate-400">
            Showing {companies.length} of {meta.total} companies
          </p>
        )}
      </div>
    </div>
  );
}

export default Companies;
