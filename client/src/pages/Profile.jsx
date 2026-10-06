import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import Navbar from "../components/Navbar";
import ConfirmDialog from "../components/ConfirmDialog";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import { emitNotificationEvent } from "../services/notificationEvents";

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
  const { endSession } = useAuth();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const closeDelete = () => {
    if (isDeleting) return;
    setDeleteOpen(false);
    setConfirmText("");
    setDeletePassword("");
    setDeleteError("");
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    setDeleteError("");
    try {
      await api.delete("/auth/account", { data: { password: deletePassword }, _skipAuthRefresh: true });
      endSession();
      toast.success("Your account has been deleted.");
      navigate("/login", { replace: true });
    } catch (err) {
      setDeleteError(
        err.response?.data?.message || err.userMessage || "Could not delete your account. Please try again."
      );
      setIsDeleting(false);
    }
  };

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
      // Mirrors mobile's useUpdateProfile (use-profile.ts): only a
      // non-empty resume text counts as a real "resume updated" event.
      if (form.resumeText.trim().length > 0) {
        emitNotificationEvent({ type: "resume_updated" });
      }
      toast.success("Profile saved");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Navbar />

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <span className="inline-flex rounded-full bg-emerald-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-800">
          Profile
        </span>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
          Your candidate profile
        </h1>
        <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-300">
          This is the info used for job matching — it's pre-filled from your
          registration details, and it's the same profile the browser
          extension's Profile tab reads and updates.
        </p>

        <div className="mt-8 rounded-[28px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm sm:p-8">
          {isLoading ? (
            <div className="space-y-4">
              <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-32 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            </div>
          ) : (
            <form className="space-y-5" onSubmit={handleSave}>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Full name
                  </label>
                  <input
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    placeholder="Your name"
                    value={form.fullName}
                    onChange={handleChange("fullName")}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Email
                  </label>
                  <input
                    type="email"
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={handleChange("email")}
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Experience (years)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  placeholder="e.g. 1.5"
                  value={form.experienceYears}
                  onChange={handleChange("experienceYears")}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Skills (comma separated)
                </label>
                <input
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  placeholder="React, Node.js, SQL"
                  value={form.skills}
                  onChange={handleChange("skills")}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Resume text
                </label>
                <textarea
                  rows={8}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
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

        <section
          aria-labelledby="danger-zone-title"
          className="mt-8 rounded-[28px] border border-rose-200 bg-white p-6 shadow-sm dark:border-rose-900 dark:bg-slate-900 sm:p-8"
        >
          <h2 id="danger-zone-title" className="text-lg font-bold text-rose-700 dark:text-rose-400">
            Danger zone
          </h2>
          <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            Delete account
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Deleting your account is permanent and cannot be undone. The following is removed:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>Applications and jobs you added</li>
            <li>Jobs imported from Gmail and saved by the browser extension</li>
            <li>Your notifications</li>
            <li>Resumes and resume tailoring history</li>
            <li>Your profile and preferences</li>
          </ul>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Shared jobs and companies fetched by administrators are not affected.
          </p>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="tt-btn tt-btn--danger mt-4"
          >
            Delete account
          </button>
        </section>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete your account?"
        confirmLabel={isDeleting ? "Deleting…" : "Delete my account"}
        busy={isDeleting}
        confirmDisabled={confirmText !== "DELETE" || !deletePassword}
        error={deleteError}
        onConfirm={handleDeleteAccount}
        onCancel={closeDelete}
      >
        <p>
          This permanently deletes your account and all of your data. This cannot be undone.
        </p>
        <div>
          <label htmlFor="delete-confirm-text" className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
            Type DELETE to confirm
          </label>
          <input
            id="delete-confirm-text"
            data-autofocus
            autoComplete="off"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <div>
          <label htmlFor="delete-confirm-password" className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
            Your password
          </label>
          <input
            id="delete-confirm-password"
            type="password"
            autoComplete="current-password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}

export default Profile;