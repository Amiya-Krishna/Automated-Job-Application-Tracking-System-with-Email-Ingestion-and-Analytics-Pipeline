import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import api from "../api";
import Navbar from "../components/Navbar";
import toast from "react-hot-toast";
import { parseJobEmail } from "../utils/emailParser";

const STATUS_OPTIONS = ["Applied", "Interview", "Offer", "Rejected"];

function JobForm() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isEditMode = Boolean(id);

  const [form, setForm] = useState({
    company: "",
    role: "",
    status: "Applied",
    interviewDate: "",
    notes: "",
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(isEditMode);
  const [showEmailPanel, setShowEmailPanel] = useState(false);
  const [emailText, setEmailText] = useState("");

  useEffect(() => {
    if (!isEditMode) return;

    const jobFromState = location.state?.job;

    if (jobFromState) {
      setForm({
        company: jobFromState.company || "",
        role: jobFromState.role || "",
        status: jobFromState.status || "Applied",
        interviewDate: jobFromState.interviewDate || "",
        notes: jobFromState.notes || "",
      });
      setIsLoading(false);
      return;
    }

    // Fallback for direct navigation / page refresh on the edit URL.
    const loadJob = async () => {
      try {
        const res = await api.get("/jobs");
        const job = res.data.find((j) => j._id === id);

        if (!job) {
          toast.error("Job not found");
          navigate("/dashboard");
          return;
        }

        setForm({
          company: job.company || "",
          role: job.role || "",
          status: job.status || "Applied",
          interviewDate: job.interviewDate || "",
          notes: job.notes || "",
        });
      } catch (err) {
        console.error(err);
        toast.error("Failed to load job");
        navigate("/dashboard");
      } finally {
        setIsLoading(false);
      }
    };

    loadJob();
  }, [id, isEditMode, location.state, navigate]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleParseEmail = () => {
    const result = parseJobEmail(emailText);

    if (!result.matched) {
      toast.error("Couldn't confidently pull details from that — try filling in manually");
      return;
    }

    setForm((prev) => ({
      company: result.company || prev.company,
      role: result.role || prev.role,
      status: result.status,
      interviewDate: result.interviewDate || prev.interviewDate,
      notes: prev.notes,
    }));

    toast.success("Fields filled in — double-check them before saving");
    setShowEmailPanel(false);
    setEmailText("");
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.company.trim()) {
      nextErrors.company = "Company name is required";
    }

    if (!form.role.trim()) {
      nextErrors.role = "Role / position is required";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      setIsSubmitting(true);

      if (isEditMode) {
        await api.put(`/jobs/${id}`, form);
        toast.success("Job updated");
      } else {
        await api.post("/jobs", form);
        toast.success("Job added to your pipeline");
      }

      navigate("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.message || "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate("/dashboard")}
          className="mb-6 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
        >
          ← Back to dashboard
        </button>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <span className="inline-flex rounded-full bg-cyan-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-800">
            {isEditMode ? "Edit Application" : "New Application"}
          </span>

          <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            {isEditMode ? "Update this application" : "Log a new application"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Keep the details current so your dashboard stays a true picture
            of your search.
          </p>

          {!isLoading && (
            <div className="mt-6">
              {!showEmailPanel ? (
                <button
                  type="button"
                  onClick={() => setShowEmailPanel(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-cyan-300 bg-cyan-50/60 px-4 py-3 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-50"
                >
                  ✨ Paste an email to auto-fill this form
                </button>
              ) : (
                <div className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-cyan-900">
                      Paste the recruiter email below
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowEmailPanel(false)}
                      className="text-xs font-semibold text-cyan-700 hover:text-cyan-900"
                    >
                      Close
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-cyan-800/80">
                    Best-effort auto-fill — it reads for company, role, status
                    and date, but always double-check before saving.
                  </p>
                  <textarea
                    rows={5}
                    className="mt-3 w-full resize-none rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                    placeholder="Paste the full email text here (subject + body)..."
                    value={emailText}
                    onChange={(e) => setEmailText(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={handleParseEmail}
                    disabled={!emailText.trim()}
                    className="mt-3 rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Auto-fill fields
                  </button>
                </div>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="mt-8 space-y-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-2xl bg-slate-100"
                />
              ))}
            </div>
          ) : (
            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Company
                  </label>
                  <input
                    className={`w-full rounded-2xl border px-4 py-3 text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 ${
                      errors.company
                        ? "border-red-400 bg-red-50"
                        : "border-slate-200 bg-white"
                    }`}
                    placeholder="e.g. Google"
                    value={form.company}
                    onChange={handleChange("company")}
                  />
                  {errors.company && (
                    <p className="mt-2 text-sm text-red-600">
                      {errors.company}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Role
                  </label>
                  <input
                    className={`w-full rounded-2xl border px-4 py-3 text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 ${
                      errors.role
                        ? "border-red-400 bg-red-50"
                        : "border-slate-200 bg-white"
                    }`}
                    placeholder="e.g. Frontend Developer"
                    value={form.role}
                    onChange={handleChange("role")}
                  />
                  {errors.role && (
                    <p className="mt-2 text-sm text-red-600">{errors.role}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Status
                  </label>
                  <select
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                    value={form.status}
                    onChange={handleChange("status")}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Interview date{" "}
                    <span className="font-normal text-slate-400">
                      (optional)
                    </span>
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                    value={form.interviewDate}
                    onChange={handleChange("interviewDate")}
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Notes{" "}
                  <span className="font-normal text-slate-400">
                    (optional)
                  </span>
                </label>
                <textarea
                  rows={4}
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                  placeholder="Recruiter contact, referral, salary range, next steps..."
                  value={form.notes}
                  onChange={handleChange("notes")}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting
                    ? "Saving..."
                    : isEditMode
                      ? "Save changes"
                      : "Add to pipeline"}
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/dashboard")}
                  className="rounded-2xl border border-slate-200 px-5 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default JobForm;
