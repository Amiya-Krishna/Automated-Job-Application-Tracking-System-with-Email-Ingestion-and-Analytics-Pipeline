import { useEffect, useState } from "react";
import api from "../api";
import Navbar from "../components/Navbar";
import toast from "react-hot-toast";

function Profile() {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    experienceYears: "",
    skills: "",
    resumeText: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await api.get("/profile");
        const p = res.data?.data;

        if (p) {
          setForm({
            fullName: p.full_name || "",
            email: p.email || "",
            experienceYears: p.experience_years ?? "",
            skills: (p.skills || []).join(", "),
            resumeText: p.resume_text || "",
          });
        }
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to load profile");
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, []);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      await api.post("/profile", {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        resumeText: form.resumeText.trim(),
        skills: form.skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        experienceYears: form.experienceYears ? Number(form.experienceYears) : null,
      });
      toast.success("Profile saved");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <span className="inline-flex rounded-full bg-emerald-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-800">
          Profile
        </span>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
          Your candidate profile
        </h1>
        <p className="mt-2 max-w-xl text-sm text-slate-600">
          This is the info used for job matching — it's pre-filled from your
          registration details, and it's the same profile the browser
          extension's Profile tab reads and updates.
        </p>

        <div className="mt-8 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {isLoading ? (
            <div className="space-y-4">
              <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
              <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
              <div className="h-32 w-full animate-pulse rounded-xl bg-slate-100" />
            </div>
          ) : (
            <form className="space-y-5" onSubmit={handleSave}>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Full name
                  </label>
                  <input
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    placeholder="Your name"
                    value={form.fullName}
                    onChange={handleChange("fullName")}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Email
                  </label>
                  <input
                    type="email"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={handleChange("email")}
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Experience (years)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  placeholder="e.g. 1.5"
                  value={form.experienceYears}
                  onChange={handleChange("experienceYears")}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Skills (comma separated)
                </label>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  placeholder="React, Node.js, SQL"
                  value={form.skills}
                  onChange={handleChange("skills")}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Resume text
                </label>
                <textarea
                  rows={8}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  placeholder="Paste your resume text — used for matching."
                  value={form.resumeText}
                  onChange={handleChange("resumeText")}
                />
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
              >
                {isSaving ? "Saving..." : "Save profile"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default Profile;
