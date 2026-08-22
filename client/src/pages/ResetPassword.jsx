import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import api from "../api";
import AuthShell from "../components/AuthShell";
import toast from "react-hot-toast";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const nextErrors = {};

    if (!password) {
      nextErrors.password = "Password is required";
    } else if (password.length < 6) {
      nextErrors.password = "Password must be at least 6 characters";
    }

    if (confirmPassword !== password) {
      nextErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!token) {
      toast.error("Reset link is missing its token — request a new one.");
      return;
    }

    if (!validate()) return;

    try {
      setIsSubmitting(true);
      const res = await api.post("/auth/reset-password", { token, password });
      toast.success(res.data.message);
      navigate("/login");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not reset password");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      badge="Reset Password"
      title="Set a new password."
      subtitle="Choose a new password for your account below."
      panelTitle="Almost there."
      panelText="Once you set a new password you'll be able to log in right away."
      stats={[
        { label: "Reset Time", value: "30 Min" },
        { label: "Steps", value: "1" },
        { label: "Secure", value: "100%" },
      ]}
      highlights={[
        "Links expire after 30 minutes for your security.",
        "Use at least 6 characters for your new password.",
        "You'll be redirected to login once it's updated.",
      ]}
      accentClass="bg-amber-100 text-amber-800"
    >
      {!token ? (
        <div className="max-w-xl space-y-5">
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-4 text-sm text-red-800">
            This reset link is missing or invalid. Request a new one.
          </div>
          <Link
            to="/forgot-password"
            className="block w-full rounded-2xl bg-slate-950 px-5 py-3.5 text-center text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Request new link
          </Link>
        </div>
      ) : (
        <form className="max-w-xl space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              New password
            </label>
            <input
              type="password"
              className={`w-full rounded-2xl border px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-100 ${errors.password ? "border-red-400 bg-red-50" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"}`}
              placeholder="Create a new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {errors.password && <p className="mt-2 text-sm text-red-600">{errors.password}</p>}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Confirm new password
            </label>
            <input
              type="password"
              className={`w-full rounded-2xl border px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-100 ${errors.confirmPassword ? "border-red-400 bg-red-50" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"}`}
              placeholder="Re-enter your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {errors.confirmPassword && (
              <p className="mt-2 text-sm text-red-600">{errors.confirmPassword}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Saving..." : "Set new password"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export default ResetPassword;
