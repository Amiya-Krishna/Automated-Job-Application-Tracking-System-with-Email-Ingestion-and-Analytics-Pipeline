import { Link } from "react-router-dom";
import { useState } from "react";
import api from "../api";
import AuthShell from "../components/AuthShell";
import toast from "react-hot-toast";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!/\S+@\S+\.\S+/.test(email)) {
      setError("Enter a valid email address");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api.post("/auth/forgot-password", { email: email.trim() });
      toast.success(res.data.message);
      setSent(true);
    } catch (err) {
      toast.error(err.response?.data?.message || "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      badge="Reset Password"
      title="Forgot your password? No problem."
      subtitle="Enter the email on your account and we'll send you a link to reset it."
      panelTitle="Get back into your dashboard fast."
      panelText="The reset link expires in 30 minutes, so grab it from your inbox right away."
      stats={[
        { label: "Reset Time", value: "30 Min" },
        { label: "Steps", value: "2" },
        { label: "Secure", value: "100%" },
      ]}
      highlights={[
        "We never reveal whether an email is registered.",
        "Reset links are single-use and time-limited.",
        "Back to a fresh password in under a minute.",
      ]}
      accentClass="bg-amber-100 text-amber-800"
    >
      {sent ? (
        <div className="max-w-xl space-y-5">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
            If an account exists for <strong>{email}</strong>, a reset link is on its way.
            Check your inbox (and spam folder).
          </div>
          <Link
            to="/login"
            className="block w-full rounded-2xl bg-slate-950 px-5 py-3.5 text-center text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Back to login
          </Link>
        </div>
      ) : (
        <form className="max-w-xl space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Email address
            </label>
            <input
              className={`w-full rounded-2xl border px-4 py-3 text-slate-900 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-100 ${error ? "border-red-400 bg-red-50" : "border-slate-200 bg-white"}`}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Sending..." : "Send reset link"}
          </button>

          <p className="text-center text-sm text-slate-600">
            Remembered it after all?{" "}
            <Link className="font-semibold text-amber-700 transition hover:text-amber-900" to="/login">
              Back to login
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}

export default ForgotPassword;
