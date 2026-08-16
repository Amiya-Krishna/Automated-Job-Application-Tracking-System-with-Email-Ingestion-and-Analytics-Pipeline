import { useEffect, useState } from "react";
import api from "../api";
import Navbar from "../components/Navbar";
import toast from "react-hot-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const FUNNEL_COLORS = ["#64748b", "#0891b2", "#3b82f6", "#8b5cf6", "#10b981"];

function Analytics() {
  const [range, setRange] = useState(30);
  const [summary, setSummary] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (rangeDays) => {
    setIsLoading(true);
    setError("");
    try {
      const [summaryRes, funnelRes] = await Promise.all([
        api.get(`/analytics?range=${rangeDays}`),
        api.get(`/analytics/funnel`),
      ]);
      setSummary(summaryRes.data?.data || null);
      setFunnel(funnelRes.data?.data || null);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to load analytics");
      toast.error("Failed to load analytics");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const funnelData = funnel
    ? [
        { name: "Scraped", value: Number(funnel.scraped) || 0 },
        { name: "Matched", value: Number(funnel.matched) || 0 },
        { name: "Applied", value: Number(funnel.applied) || 0 },
        { name: "Interview", value: Number(funnel.interview) || 0 },
        { name: "Offer", value: Number(funnel.offer) || 0 },
      ]
    : [];

  const conversion = summary?.conversionRate || {};
  const counts = summary?.counts || {};

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <span className="inline-flex rounded-full bg-cyan-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-800">
              Engine
            </span>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
              Analytics
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              How your scraped jobs move through matching, applying, and
              outcomes — computed live from the engine tables.
            </p>
          </div>

          <select
            value={range}
            onChange={(e) => setRange(Number(e.target.value))}
            className="w-fit rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        {error && (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}

        {/* SUMMARY */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            title="Total applications"
            value={summary?.totalApplications ?? "—"}
            loading={isLoading}
          />
          <StatCard
            title="Response rate"
            value={summary?.responseRatePct != null ? `${summary.responseRatePct}%` : "—"}
            loading={isLoading}
            accent="text-cyan-600"
          />
          <StatCard
            title="Avg. response time"
            value={
              summary?.averageResponseTimeHours != null
                ? `${summary.averageResponseTimeHours}h`
                : "—"
            }
            loading={isLoading}
          />
          <StatCard
            title="Interviews"
            value={counts.interviews ?? "—"}
            loading={isLoading}
            accent="text-blue-600"
          />
          <StatCard
            title="Offers"
            value={counts.offers ?? "—"}
            loading={isLoading}
            accent="text-emerald-600"
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          {/* CONVERSION */}
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Conversion</h2>
            <p className="text-sm text-slate-500">
              Share of applications that advance to each stage.
            </p>

            <div className="mt-5 space-y-4">
              <ConversionBar
                label="Applied → Interview"
                pct={conversion.appliedToInterviewPct}
              />
              <ConversionBar
                label="Interview → Offer"
                pct={conversion.interviewToOfferPct}
              />
              <ConversionBar
                label="Applied → Offer"
                pct={conversion.appliedToOfferPct}
                color="bg-emerald-500"
              />
            </div>
          </div>

          {/* FUNNEL */}
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Funnel</h2>
            <p className="text-sm text-slate-500">
              Scraped → matched → applied → interview → offer.
            </p>

            <div className="mt-4 h-72">
              {isLoading ? (
                <div className="h-full animate-pulse rounded-2xl bg-slate-100" />
              ) : funnelData.every((d) => d.value === 0) ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  No engine activity yet
                </div>
              ) : (
                <ResponsiveContainer>
                  <BarChart data={funnelData} layout="vertical" margin={{ left: 10 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={80}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12, fill: "#475569" }}
                    />
                    <Tooltip cursor={{ fill: "rgba(148,163,184,0.1)" }} />
                    <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={22}>
                      {funnelData.map((entry, i) => (
                        <Cell key={entry.name} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, accent = "text-slate-900", loading }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      {loading ? (
        <div className="mt-2 h-7 w-14 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className={`mt-2 text-2xl font-black sm:text-3xl ${accent}`}>{value}</p>
      )}
    </div>
  );
}

function ConversionBar({ label, pct, color = "bg-cyan-500" }) {
  const value = pct != null ? Number(pct) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="font-bold text-slate-900">
          {pct != null ? `${pct}%` : "—"}
        </span>
      </div>
      <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

export default Analytics;
