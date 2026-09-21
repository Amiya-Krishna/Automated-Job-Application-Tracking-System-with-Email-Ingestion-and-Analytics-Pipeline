import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import Navbar from "../components/Navbar";
import { EmptyState, ErrorState, LoadingSkeleton } from "../components/StateViews";
import {
  STAGES,
  analyzeJob,
  approveVersion,
  downloadExport,
  getMatchAnalysis,
  getVersion,
  jobFromKey,
  previewVersion,
  startTailoring,
  waitForSession,
} from "../services/resumeApi";

const card = "rounded-[28px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm";
const input =
  "w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 dark:focus:ring-cyan-900";

const STATE_UI = {
  MATCHED: { icon: "✓", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", label: "Matched" },
  PARTIAL_MATCH: { icon: "⚠", chip: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", label: "Related experience only" },
  NOT_FOUND: { icon: "✕", chip: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300", label: "Missing / Not found in your profile" },
};
const TYPE_LABEL = { required: "Required", mentioned: "Mentioned", preferred: "Preferred" };
const CHECK_UI = { pass: "text-emerald-600 dark:text-emerald-400", warn: "text-amber-600 dark:text-amber-400", fail: "text-rose-600 dark:text-rose-400" };
const CHECK_ICON = { pass: "✓", warn: "⚠", fail: "✕" };
const SECTION_LABEL = { summary: "Summary", experience: "Experience", projects: "Projects", skills: "Skills" };

function scoreTone(score) {
  if (score === null || score === undefined) return "text-slate-500";
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function SkillChip({ req }) {
  const ui = STATE_UI[req.state];
  return (
    <span title={`${req.label} · ${TYPE_LABEL[req.type]}`} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${ui.chip}`}>
      <span aria-hidden>{ui.icon}</span>
      {req.requirement}
    </span>
  );
}

function ProgressSteps({ stage }) {
  const idx = Math.max(0, STAGES.findIndex((s) => s.key === stage));
  return (
    <ol className="space-y-2" aria-live="polite">
      {STAGES.map((s, i) => {
        const done = i < idx || stage === "ready";
        const active = i === idx && stage !== "ready";
        return (
          <li key={s.key} className={`flex items-center gap-3 text-sm ${done ? "text-emerald-600 dark:text-emerald-400" : active ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${active ? "animate-pulse border-cyan-500" : "border-current"}`}>{done ? "✓" : i + 1}</span>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

function ChangeCard({ change, decision, reviewMode, readOnly, onDecide }) {
  const [open, setOpen] = useState(false);
  const status = readOnly ? change.status : decision;
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4" data-testid={`change-${change.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">{SECTION_LABEL[change.section] || change.section}</span>
          <span className="text-[11px] font-semibold uppercase text-slate-400">{change.op === "reorder" ? "Reordered" : "Reworded"}</span>
          {status === "accepted" && <span className="text-xs font-bold text-emerald-600">Accepted</span>}
          {status === "rejected" && <span className="text-xs font-bold text-rose-600">Rejected</span>}
        </div>
        {reviewMode && !readOnly && (
          <div className="flex gap-2">
            <button onClick={() => onDecide(change.id, "accepted")} aria-pressed={decision === "accepted"} className={`rounded-full px-3 py-1 text-xs font-bold ${decision === "accepted" ? "bg-emerald-600 text-white" : "border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}>Accept</button>
            <button onClick={() => onDecide(change.id, "rejected")} aria-pressed={decision === "rejected"} className={`rounded-full px-3 py-1 text-xs font-bold ${decision === "rejected" ? "bg-rose-600 text-white" : "border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}>Reject</button>
          </div>
        )}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <p className="text-[11px] font-bold uppercase text-slate-400">Original</p>
          <pre className="mt-1 whitespace-pre-wrap break-words rounded-xl bg-slate-50 dark:bg-slate-800 p-3 font-sans text-sm text-slate-700 dark:text-slate-300">{change.original}</pre>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase text-cyan-600">Tailored</p>
          <pre className="mt-1 whitespace-pre-wrap break-words rounded-xl bg-cyan-50 dark:bg-cyan-950/40 p-3 font-sans text-sm text-slate-900 dark:text-slate-100">{change.proposed}</pre>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300"><span className="font-semibold">Reason:</span> {change.reason}</p>
      {change.evidence?.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setOpen((o) => !o)} className="text-xs font-semibold text-cyan-700 dark:text-cyan-400 hover:underline">
            {open ? "Hide" : "Show"} evidence from your resume ({change.evidence.length})
          </button>
          {open && (
            <ul className="mt-2 space-y-1">
              {change.evidence.map((e) => (
                <li key={e.factId} className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300">“{e.text}” <span className="text-slate-400">— {e.sourcePath}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const BLOCKING_CODES = ["no_resume", "resume_unreadable"];
// no_resume / resume_unreadable get their own call-to-action panel (not the generic error panel)
const phaseForError = (e, fallback = "error") => (BLOCKING_CODES.includes(e.code) ? "blocked" : fallback);

const EXPORTS = [["pdf", "PDF"], ["docx", "Word"], ["txt", "Text"], ["md", "Markdown"], ["html", "HTML"]];

function ResumeTailoring() {
  const [params, setParams] = useSearchParams();
  const jobKey = params.get("job");
  const versionParam = params.get("version");
  const analysisParam = params.get("analysis"); // e.g. opened from the browser extension: "jd-<hash>"
  const resumeParam = Number(params.get("resume")) || undefined; // resume chosen for this job (browser extension hand-off)

  const [phase, setPhase] = useState(versionParam || jobKey || analysisParam ? "loading" : "needs_input");
  const [error, setError] = useState(null); // {message, code}
  const [analysis, setAnalysis] = useState(null);
  const [version, setVersion] = useState(null);
  const [stage, setStage] = useState("analyzing_resume");
  const [notes, setNotes] = useState([]);
  const [reviewMode, setReviewMode] = useState(false);
  const [decisions, setDecisions] = useState({});
  const [previewText, setPreviewText] = useState(null);
  const [busy, setBusy] = useState(false);
  const [jdForm, setJdForm] = useState({ title: "", company: "", description: "" });
  const [showJd, setShowJd] = useState(false);
  const cancelRef = useRef(null);

  const baseJob = useMemo(() => {
    const fromKey = jobFromKey(jobKey);
    return fromKey || null;
  }, [jobKey]);

  const jobPayload = useCallback(() => {
    const pasted = jdForm.description.trim();
    if (baseJob) return pasted ? { ...baseJob, description: pasted } : baseJob;
    if (analysisParam && analysis?.jd) {
      // ad-hoc job (extension / pasted): re-use the JD text stored with the analysis
      const { title, company, location, description } = analysis.jd;
      return { title, company, location, description, sourceName: "extension" };
    }
    if (version) {
      // regenerate from a saved version: reuse the job it was made for
      return jobFromKey(version.jobKey) || { title: version.targetTitle, company: version.targetCompany, description: version.analysis?.jd?.description || "" };
    }
    return { title: jdForm.title.trim(), company: jdForm.company.trim(), description: pasted, sourceName: "manual" };
  }, [baseJob, jdForm, version, analysisParam, analysis]);

  // ---- load: existing version, or analyse the job
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (versionParam) {
          const v = await getVersion(versionParam);
          if (cancelled) return;
          setVersion(v);
          setAnalysis(v.analysis);
          setPhase("review");
        } else if (analysisParam) {
          const a = await getMatchAnalysis(analysisParam, resumeParam);
          if (cancelled) return;
          setAnalysis(a);
          setPhase("analyzed");
        } else if (baseJob) {
          const a = await analyzeJob({ job: baseJob, ...(resumeParam ? { resumeId: resumeParam } : {}) });
          if (cancelled) return;
          setAnalysis(a);
          setPhase("analyzed");
        }
      } catch (e) {
        if (cancelled) return;
        setError({ message: e.message, code: e.code });
        setPhase(e.code === "jd_too_short" ? "needs_input" : phaseForError(e));
      }
    })();
    return () => { cancelled = true; };
  }, [versionParam, baseJob, analysisParam, resumeParam]);

  // ---- live preview while reviewing (server applies decisions; client never re-implements it)
  useEffect(() => {
    if (!reviewMode || !version || version.status !== "draft") return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const p = await previewVersion(version.id, decisions);
        if (!cancelled) setPreviewText(p.resumeText);
      } catch (e) { if (!cancelled) toast.error(e.message); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [decisions, reviewMode, version]);

  useEffect(() => () => cancelRef.current?.abort(), []);

  const runAnalyzeFromForm = async () => {
    setBusy(true);
    setError(null);
    try {
      const a = await analyzeJob({ job: jobPayload(), ...(resumeParam ? { resumeId: resumeParam } : {}) });
      setAnalysis(a);
      setPhase("analyzed");
    } catch (e) {
      setError({ message: e.message, code: e.code });
      if (!["jd_too_short", "invalid_request"].includes(e.code)) setPhase(phaseForError(e));
    } finally { setBusy(false); }
  };

  const runTailor = async (regenerate = false) => {
    setBusy(true);
    setError(null);
    setPhase("tailoring");
    setStage("analyzing_resume");
    const ctrl = new AbortController();
    cancelRef.current = ctrl;
    try {
      const session = await startTailoring({ job: jobPayload(), regenerate: regenerate || undefined, ...(resumeParam ? { resumeId: resumeParam } : {}) });
      const done = await waitForSession(session.id, { onUpdate: (s) => setStage(s.stage), signal: ctrl.signal });
      setNotes(done.warnings || []);
      const v = await getVersion(done.versionId);
      setVersion(v);
      setAnalysis(v.analysis);
      setDecisions({});
      setReviewMode(false);
      setPreviewText(null);
      setPhase("review");
      setParams({ version: String(v.id) }, { replace: true });
    } catch (e) {
      setError({ message: e.message, code: e.code });
      setPhase(e.code === "no_matching_skills" ? "analyzed" : phaseForError(e));
    } finally { setBusy(false); }
  };

  const decide = (id, d) => setDecisions((cur) => ({ ...cur, [id]: d }));

  const finalize = async (action) => {
    setBusy(true);
    try {
      const body = action === "review" ? { action, decisions } : { action };
      const v = await approveVersion(version.id, body);
      setVersion(v);
      setReviewMode(false);
      setPreviewText(null);
      toast.success(v.status === "rejected" ? "No changes applied — your original wording is kept." : "Tailored resume approved.");
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const doExport = async (fmt) => {
    try {
      await downloadExport(version.id, fmt);
    } catch (e) { toast.error(e.message); }
  };

  const jd = analysis?.jd;
  const reqs = analysis?.requirements || [];
  const draft = version?.status === "draft";
  const shownText = previewText ?? version?.resumeText;
  const acceptedCount = Object.values(decisions).filter((d) => d === "accepted").length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <span className="inline-flex rounded-full bg-cyan-100 dark:bg-cyan-950 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-800 dark:text-cyan-300">Resume Tailoring</span>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">{jd?.title || version?.targetTitle || "Tailor your resume"}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {jd?.company || version?.targetCompany || "Match your existing resume to a job — using only what's already true about you."}
        </p>

        {phase === "loading" && <div className={`mt-6 ${card}`}><LoadingSkeleton rows={5} /></div>}

        {phase === "error" && <div className={`mt-6 ${card}`}><ErrorState message={error?.message} onRetry={() => window.location.reload()} /></div>}

        {phase === "blocked" && (
          <div className={`mt-6 ${card}`}>
            <EmptyState
              title={error?.message}
              description="Your resume is the only source of truth for tailoring. Upload a PDF/DOCX or paste your resume text."
              action={<Link to="/resumes" className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Go to My Resumes</Link>}
            />
          </div>
        )}

        {phase === "needs_input" && (
          <div className={`mt-6 p-6 ${card}`}>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Paste the job description</h2>
            {error && <p role="alert" className="mt-2 text-sm font-medium text-rose-600 dark:text-rose-400">{error.message}</p>}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {!baseJob && (
                <>
                  <input className={input} placeholder="Job title (e.g. Software Engineer Intern)" value={jdForm.title} onChange={(e) => setJdForm((f) => ({ ...f, title: e.target.value }))} />
                  <input className={input} placeholder="Company" value={jdForm.company} onChange={(e) => setJdForm((f) => ({ ...f, company: e.target.value }))} />
                </>
              )}
              <textarea className={`${input} md:col-span-2`} rows={10} placeholder="Paste the full job description here…" value={jdForm.description} onChange={(e) => setJdForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <button onClick={runAnalyzeFromForm} disabled={busy || jdForm.description.trim().length < 20} className="mt-4 rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">{busy ? "Analyzing…" : "Analyze job"}</button>
          </div>
        )}

        {phase === "tailoring" && (
          <div className={`mt-6 p-6 ${card}`}>
            <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-slate-100">Working on it…</h2>
            <ProgressSteps stage={stage} />
          </div>
        )}

        {(phase === "analyzed" || phase === "review") && analysis && (
          <>
            {/* ---- TOP: match, coverage, ATS */}
            <div className={`mt-6 grid gap-6 p-6 lg:grid-cols-3 ${card}`}>
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">Resume match</p>
                <p className={`mt-1 text-5xl font-black ${scoreTone(analysis.matchScore)}`} data-testid="match-score">{analysis.matchScore === null ? "—" : `${analysis.matchScore}%`}</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Based only on skills your resume actually supports. Missing skills are never added to raise this number.</p>
              </div>
              <div className="lg:col-span-1">
                <p className="text-xs font-bold uppercase text-slate-400">Skill coverage</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {reqs.length === 0 && <span className="text-sm text-slate-500">No specific skills were recognised in this description.</span>}
                  {reqs.map((r) => <SkillChip key={r.id} req={r} />)}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">ATS analysis · {analysis.ats?.score}/100</p>
                <ul className="mt-2 space-y-1">
                  {analysis.ats?.checks?.map((c) => (
                    <li key={c.id} className="text-xs text-slate-600 dark:text-slate-300" title={c.detail}>
                      <span className={`font-bold ${CHECK_UI[c.status]}`}>{CHECK_ICON[c.status]}</span> {c.label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {analysis.warnings?.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 p-4 text-sm text-amber-900 dark:text-amber-200">
                {analysis.warnings.map((w) => <p key={w}>{w}</p>)}
              </div>
            )}
            {error?.code === "no_matching_skills" && (
              <div role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40 p-4 text-sm text-rose-900 dark:text-rose-200">{error.message}</div>
            )}

            {/* ---- MIDDLE: JD | resume */}
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className={`p-6 ${card}`}>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Job description</h2>
                <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                  {reqs.map((r) => (
                    <li key={r.id} className="py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <SkillChip req={r} />
                        <span className="text-[11px] font-semibold uppercase text-slate-400">{TYPE_LABEL[r.type]}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {r.state === "NOT_FOUND" ? "Missing / Not found in your profile — it will not be added." : r.note}
                      </p>
                    </li>
                  ))}
                </ul>
                {analysis.reviewManually?.experience?.length > 0 || analysis.reviewManually?.education?.length > 0 ? (
                  <div className="mt-4 rounded-2xl bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-600 dark:text-slate-300">
                    <p className="font-semibold">Check these yourself</p>
                    <ul className="mt-1 list-disc pl-4">
                      {[...analysis.reviewManually.experience, ...analysis.reviewManually.education].map((t) => <li key={t}>{t}</li>)}
                    </ul>
                  </div>
                ) : null}
                <button onClick={() => setShowJd((s) => !s)} className="mt-4 text-xs font-semibold text-cyan-700 dark:text-cyan-400 hover:underline">{showJd ? "Hide" : "Show"} original job description</button>
                {showJd && <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 dark:bg-slate-800 p-3 font-sans text-xs text-slate-700 dark:text-slate-300">{jd?.description}</pre>}
              </div>

              <div className={`p-6 ${card}`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{version ? (draft ? "Tailored resume (preview)" : "Tailored resume") : "Tailored resume"}</h2>
                  {version && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${version.status === "approved" ? "bg-emerald-100 text-emerald-800" : version.status === "rejected" ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-800"}`}>{version.status}</span>}
                </div>
                {!version ? (
                  <div className="mt-4">
                    <p className="text-sm text-slate-600 dark:text-slate-300">TrackTrail will reorder and reword only what is already on your resume. You review every change before anything is applied, and your original is never modified.</p>
                    <button onClick={() => runTailor(false)} disabled={busy} className="mt-4 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">Generate tailored resume</button>
                  </div>
                ) : (
                  <pre data-testid="resume-preview" className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-50 dark:bg-slate-800 p-4 font-sans text-sm text-slate-800 dark:text-slate-200">{shownText}</pre>
                )}
              </div>
            </div>

            {/* ---- BOTTOM: change review */}
            {version && (
              <div className={`mt-6 p-6 ${card}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Change review</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{version.changes.length} suggested change{version.changes.length === 1 ? "" : "s"}. Nothing is applied until you approve.</p>
                  </div>
                  {draft && version.changes.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => finalize("accept_all")} disabled={busy} className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">Accept all</button>
                      <button onClick={() => finalize("reject_all")} disabled={busy} className="rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-300 disabled:opacity-60">Reject all</button>
                      <button onClick={() => setReviewMode((m) => !m)} className="rounded-2xl border border-cyan-300 px-4 py-2 text-sm font-semibold text-cyan-800 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950">{reviewMode ? "Hide review" : "Review changes"}</button>
                    </div>
                  )}
                  {draft && version.changes.length === 0 && (
                    <button onClick={() => finalize("reject_all")} disabled={busy} className="rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold">Keep original</button>
                  )}
                </div>

                {version.changes.length === 0 && <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">No safe improvements were found for this job. Your resume was left exactly as it is.</p>}

                <div className="mt-4 space-y-3">
                  {version.changes.map((c) => (
                    <ChangeCard key={c.id} change={c} decision={decisions[c.id] || "pending"} reviewMode={reviewMode} readOnly={!draft} onDecide={decide} />
                  ))}
                </div>

                {draft && reviewMode && (
                  <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 dark:bg-slate-800 p-4">
                    <p className="text-sm text-slate-600 dark:text-slate-300">{acceptedCount} of {version.changes.length} accepted. Changes you don't accept are not applied.</p>
                    <button onClick={() => finalize("review")} disabled={busy} className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">Apply selected changes</button>
                  </div>
                )}

                {version.unsupportedClaims?.length > 0 && (
                  <details className="mt-5 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200">{version.unsupportedClaims.length} AI suggestion{version.unsupportedClaims.length === 1 ? " was" : "s were"} blocked by the safety check</summary>
                    <ul className="mt-3 space-y-3">
                      {version.unsupportedClaims.map((u) => (
                        <li key={u.unitId} className="text-xs text-slate-600 dark:text-slate-300">
                          <p className="line-through">{u.proposed}</p>
                          <p className="mt-0.5 font-medium text-rose-600 dark:text-rose-400">{[...new Set(u.violations.map((v) => v.detail))].slice(0, 3).join(" · ")}</p>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {version.recommendations?.length > 0 && (
                  <div className="mt-5">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">What TrackTrail did not do</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                      {version.recommendations.map((r, i) => <li key={`${r.type}-${i}`}>{r.message}</li>)}
                    </ul>
                  </div>
                )}

                {notes.length > 0 && <div className="mt-4 text-xs text-slate-500">{notes.map((n) => <p key={n}>{n}</p>)}</div>}

                {version.status !== "draft" && (
                  <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-5">
                    <span className="mr-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Download:</span>
                    {EXPORTS.map(([f, label]) => (
                      <button key={f} onClick={() => doExport(f)} className="rounded-full border border-slate-200 dark:border-slate-700 px-3.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-cyan-400">{label}</button>
                    ))}
                    <button onClick={() => runTailor(true)} disabled={busy} className="ml-auto text-xs font-semibold text-cyan-700 dark:text-cyan-400 hover:underline">Regenerate</button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ResumeTailoring;
