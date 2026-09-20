import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import Navbar from "../components/Navbar";
import { EmptyState, ErrorState, LoadingSkeleton } from "../components/StateViews";
import { downloadExport, getCurrentResume, listVersions, uploadResume } from "../services/resumeApi";

const card = "rounded-[28px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm";
const STATUS_STYLE = {
  draft: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");

function ResumeVersions() {
  const [state, setState] = useState({ loading: true, error: null, current: null, reason: null, reasonMessage: null, list: null });
  const [uploading, setUploading] = useState(false);
  const [syncProfile, setSyncProfile] = useState(true);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [cur, list] = await Promise.all([getCurrentResume(), listVersions()]);
      setState({ loading: false, error: null, current: cur.resume, reason: cur.reason || null, reasonMessage: cur.message || null, list });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) await load(); })();
    return () => { cancelled = true; };
  }, [load]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      await uploadResume(file, { syncProfile });
      toast.success("Resume uploaded.");
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally { setUploading(false); }
  };

  const exportOriginal = async (fmt) => {
    try { await downloadExport("original", fmt); } catch (e) { toast.error(e.message); }
  };

  const { current, list } = state;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <span className="inline-flex rounded-full bg-cyan-100 dark:bg-cyan-950 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-800 dark:text-cyan-300">Resumes</span>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">My Resumes</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Your original resume is never overwritten. Each tailored version is stored separately.</p>

        {state.loading && <div className={`mt-6 ${card}`}><LoadingSkeleton rows={4} /></div>}
        {state.error && <div className={`mt-6 ${card}`}><ErrorState message={state.error} onRetry={load} /></div>}

        {!state.loading && !state.error && (
          <>
            <div className={`mt-6 p-6 ${card}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Original resume</h2>
                  {current ? (
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {current.fileName ? `${current.fileName} · ` : "Pasted text on your profile · "}
                      {current.parseQuality?.counts?.facts ?? 0} items recognised · saved {fmtDate(current.createdAt)}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{state.reasonMessage || "Upload your resume before tailoring."}</p>
                  )}
                  {current?.parseQuality?.warnings?.length > 0 && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{current.parseQuality.warnings.join(" ")}</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <input ref={fileRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onFile} className="hidden" data-testid="resume-file-input" />
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">{uploading ? "Uploading…" : "Upload PDF or DOCX"}</button>
                  <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <input type="checkbox" checked={syncProfile} onChange={(e) => setSyncProfile(e.target.checked)} />
                    Also use it as my profile text for job matching
                  </label>
                </div>
              </div>
              {current && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                  <span className="text-xs font-semibold text-slate-500">Download original (re-formatted):</span>
                  {[["pdf", "PDF"], ["docx", "Word"], ["txt", "Text"]].map(([f, l]) => (
                    <button key={f} onClick={() => exportOriginal(f)} className="rounded-full border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-cyan-400">{l}</button>
                  ))}
                  <Link to="/profile" className="ml-auto text-xs font-semibold text-cyan-700 dark:text-cyan-400 hover:underline">Edit profile text →</Link>
                </div>
              )}
            </div>

            <div className={`mt-6 ${card}`}>
              <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Tailored versions</h2>
              </div>
              {list?.versions.length === 0 ? (
                <EmptyState title="No tailored versions yet" description="Open a job in Applied Jobs or Matched Jobs and choose “Tailor Resume”." action={<Link to="/tailor" className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Paste a job description</Link>} />
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {list.versions.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{v.label}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{fmtDate(v.createdAt)} · match {v.matchScore ?? "—"}% · {v.acceptedCount}/{v.changeCount} changes accepted{v.aiUsed ? " · AI-assisted" : ""}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[v.status]}`}>{v.status}</span>
                        <Link to={`/tailor?version=${v.id}`} className="text-sm font-semibold text-cyan-700 dark:text-cyan-400 hover:underline">{v.status === "draft" ? "Review" : "Open"}</Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ResumeVersions;
