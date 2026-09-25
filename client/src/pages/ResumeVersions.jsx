import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import Navbar from "../components/Navbar";
import { EmptyState, ErrorState, LoadingSkeleton } from "../components/StateViews";
import { activateResume, deleteResume, downloadExport, downloadOriginalFile, listResumes, listVersions, uploadResume } from "../services/resumeApi";

const card = "rounded-[28px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm";
const STATUS_STYLE = {
  draft: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};
const TYPE_LABEL = { pdf: "PDF", docx: "DOCX", text: "Profile text" };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");
const provenance = (v) => (v.aiUsed ? `AI-assisted · ${v.aiProvider || "provider"}` : "Reorder-only");

function ResumeVersions() {
  const [state, setState] = useState({ loading: true, error: null, data: null, versions: null });
  const [uploading, setUploading] = useState(false);
  const [syncProfile, setSyncProfile] = useState(true);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [data, versions] = await Promise.all([listResumes(), listVersions()]);
      setState({ loading: false, error: null, data, versions });
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

  const use = async (r) => {
    try { await activateResume(r.id); toast.success(`“${r.name}” will be used for tailoring.`); await load(); } catch (e) { toast.error(e.message); }
  };

  const remove = async (r) => {
    const n = r.versionCount;
    if (!window.confirm(`Delete “${r.name}”?${n ? ` This also deletes its ${n} tailored version${n === 1 ? "" : "s"}.` : ""} This cannot be undone.`)) return;
    try { await deleteResume(r.id); toast.success("Resume deleted."); await load(); } catch (e) { toast.error(e.message); }
  };

  const exportOriginal = async (fmt) => {
    try { await downloadExport("original", fmt); } catch (e) { toast.error(e.message); }
  };

  const resumes = state.data?.resumes || [];
  const versions = state.versions?.versions || [];
  const nameOf = (id) => resumes.find((r) => r.id === id)?.name;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <span className="inline-flex rounded-full bg-cyan-100 dark:bg-cyan-950 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-800 dark:text-cyan-300">Resumes</span>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">My Resumes</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Your resumes are never overwritten. Choose which one TrackTrail tailors; each tailored version is stored separately. The same resumes appear in the browser extension and the mobile app.</p>

        {state.loading && <div className={`mt-6 ${card}`}><LoadingSkeleton rows={4} /></div>}
        {state.error && <div className={`mt-6 ${card}`}><ErrorState message={state.error} onRetry={load} /></div>}

        {!state.loading && !state.error && (
          <>
            <div className={`mt-6 p-6 ${card}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Upload a resume</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">PDF or DOCX, up to 2 MB. A new upload becomes the resume used for tailoring.</p>
                  {resumes.length === 0 && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">Upload your resume before tailoring.</p>}
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
            </div>

            <div className="mt-6 space-y-4">
              {resumes.map((r) => (
                <article key={r.id} data-testid={`resume-${r.id}`} className={`p-5 ${card} ${r.isActive ? "ring-2 ring-cyan-400" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100 break-words">{r.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Uploaded {fmtDate(r.createdAt)} · {r.factsCount} facts parsed · {r.versionCount} tailored version{r.versionCount === 1 ? "" : "s"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-slate-200">{TYPE_LABEL[r.fileType] || r.fileType}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${r.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{r.isActive ? "Active" : "Available"}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                    <button onClick={() => use(r)} disabled={r.isActive} className="rounded-full bg-slate-950 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50">{r.isActive ? "In use for tailoring" : "Use for tailoring"}</button>
                    {r.hasFile && <button onClick={() => downloadOriginalFile(r.id).catch((e) => toast.error(e.message))} className="rounded-full border border-slate-200 dark:border-slate-700 px-3.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-cyan-400">Download original</button>}
                    {r.isActive && [["pdf", "PDF"], ["docx", "Word"], ["txt", "Text"]].map(([f, l]) => (
                      <button key={f} onClick={() => exportOriginal(f)} className="rounded-full border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-cyan-400">{l}</button>
                    ))}
                    {r.sourceType === "profile_text" && <Link to="/profile" className="text-xs font-semibold text-cyan-700 dark:text-cyan-400 hover:underline">Edit profile text →</Link>}
                    <button onClick={() => remove(r)} className="ml-auto rounded-full border border-rose-300 px-3.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950">Delete</button>
                  </div>
                </article>
              ))}
            </div>

            <div className={`mt-6 ${card}`}>
              <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Tailored versions</h2>
              </div>
              {versions.length === 0 ? (
                <EmptyState title="No tailored versions yet" description="Open a job in Applied Jobs or Matched Jobs — or on LinkedIn/Indeed with the extension — and choose “Tailor Resume”." action={<Link to="/tailor" className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Paste a job description</Link>} />
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {versions.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{v.label}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{fmtDate(v.createdAt)} · match {v.matchScore ?? "—"}% · {v.acceptedCount}/{v.changeCount} changes accepted · {provenance(v)}{nameOf(v.resumeId) ? ` · from ${nameOf(v.resumeId)}` : ""}</p>
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
