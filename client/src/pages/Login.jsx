import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "../api";
import AuthShell from "../components/AuthShell";
import { getStoredToken, storeToken } from "../utils/auth";
import toast from "react-hot-toast";

function Login() {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    if (getStoredToken()) {
      navigate("/dashboard");
    }
  }, [navigate]);

  const validateLogin = () => {
    const nextErrors = {};

    if (!email.trim()) {
      nextErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      nextErrors.email = "Enter a valid email address";
    }

    if (!password) {
      nextErrors.password = "Password is required";
    } else if (password.length < 6) {
      nextErrors.password = "Password must be at least 6 characters";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validateLogin()) {
      return;
    }

    try {
      setIsSubmitting(true);

      const res = await api.post("/auth/login", {
        email: email.trim(),
        password
      });

      storeToken(res.data.token, rememberMe);

      toast.success(`Welcome back, ${res.data.user.name}`);

      navigate("/dashboard");

    } catch (error) {
      const message = error.response?.data?.message || "Login failed";

      toast.error(message);

      if (message === "User not found") {
        navigate("/register");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      badge="Secure Login"
      title="Track every application with less chaos."
      subtitle="Sign in to manage interviews, offers, and follow-ups from one focused dashboard."
      panelTitle="A cleaner workflow for your job search."
      panelText="Keep your pipeline visible, update statuses fast, and avoid losing opportunities in scattered notes and tabs."
      stats={[
        { label: "Status Views", value: "4" },
        { label: "Job Pipeline", value: "24/7" },
        { label: "Quick Updates", value: "1 Tap" },
      ]}
      highlights={[
        "Filter jobs by stage and search company names instantly.",
        "Update interview progress without leaving the dashboard.",
        "Keep sign-in flexible with a working remember me option.",
      ]}
      accentClass="bg-cyan-100 text-cyan-800"
    >
      <form
        className="max-w-xl space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          handleLogin();
        }}
      >
        <div className="grid gap-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Email address
            </label>
            <input
              className={`w-full rounded-2xl border px-4 py-3 text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 ${errors.email ? "border-red-400 bg-red-50" : "border-slate-200 bg-white"}`}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors.email && (
              <p className="mt-2 text-sm text-red-600">{errors.email}</p>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-semibold text-slate-700">
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-sm font-medium text-cyan-700 transition hover:text-cyan-900"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <input
              className={`w-full rounded-2xl border px-4 py-3 text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 ${errors.password ? "border-red-400 bg-red-50" : "border-slate-200 bg-white"}`}
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {errors.password && (
              <p className="mt-2 text-sm text-red-600">{errors.password}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            Keep me signed in on this device
          </label>

          <span className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
            Protected Access
          </span>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Signing in..." : "Login to Dashboard"}
        </button>

        <p className="text-center text-sm text-slate-600">
          Need an account?{" "}
          <Link className="font-semibold text-cyan-700 transition hover:text-cyan-900" to="/register">
            Create one now
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export default Login;
