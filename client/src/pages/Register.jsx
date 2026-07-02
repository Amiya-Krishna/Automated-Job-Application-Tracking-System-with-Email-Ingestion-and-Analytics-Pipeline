import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "../api";
import AuthShell from "../components/AuthShell";
import { getStoredToken } from "../utils/auth";
import toast from "react-hot-toast";

function Register() {

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    if (getStoredToken()) {
      navigate("/dashboard");
    }
  }, [navigate]);

  const passwordStrength = password.length >= 10
    ? "Strong"
    : password.length >= 6
      ? "Good"
      : password.length > 0
        ? "Weak"
        : "Add a password";

  const strengthClass = password.length >= 10
    ? "text-emerald-600"
    : password.length >= 6
      ? "text-amber-600"
      : "text-rose-600";

  const validateRegister = () => {
    const nextErrors = {};

    if (!name.trim()) {
      nextErrors.name = "Full name is required";
    } else if (name.trim().length < 2) {
      nextErrors.name = "Enter at least 2 characters";
    }

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

    if (!confirmPassword) {
      nextErrors.confirmPassword = "Please confirm your password";
    } else if (confirmPassword !== password) {
      nextErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validateRegister()) {
      return;
    }

    try {
      setIsSubmitting(true);

      const res = await api.post("/auth/register", {
        name: name.trim(),
        email: email.trim(),
        password
      });

      toast.success(res.data.message);

      navigate("/login");

    } catch (error) {
      toast.error(error.response?.data?.message || "Registration failed");
    } finally {
      setIsSubmitting(false);
    }

  };

  return (
    <AuthShell
      badge="Create Account"
      title="Start organizing your job hunt like a pro."
      subtitle="Build your account to save applications, monitor progress, and keep every opportunity in one place."
      panelTitle="Built for a smoother application journey."
      panelText="From first application to final offer, your tracker stays focused on the details that actually move your search forward."
      stats={[
        { label: "Job Stages", value: "4" },
        { label: "Fast Setup", value: "2 Min" },
        { label: "One Dashboard", value: "100%" },
      ]}
      highlights={[
        "Confirm your password before account creation.",
        "Live password strength hint for better account security.",
        "Responsive layout that feels premium on mobile and desktop.",
      ]}
      accentClass="bg-emerald-100 text-emerald-800"
    >
      <form
        className="max-w-xl space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          handleRegister();
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Full name
            </label>
            <input
              className={`w-full rounded-2xl border px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 ${errors.name ? "border-red-400 bg-red-50" : "border-slate-200 bg-white"}`}
              placeholder="Type your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name && (
              <p className="mt-2 text-sm text-red-600">{errors.name}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Email address
            </label>
            <input
              className={`w-full rounded-2xl border px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 ${errors.email ? "border-red-400 bg-red-50" : "border-slate-200 bg-white"}`}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors.email && (
              <p className="mt-2 text-sm text-red-600">{errors.email}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-semibold text-slate-700">
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-sm font-medium text-emerald-700 transition hover:text-emerald-900"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <input
              className={`w-full rounded-2xl border px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 ${errors.password ? "border-red-400 bg-red-50" : "border-slate-200 bg-white"}`}
              type={showPassword ? "text" : "password"}
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="mt-2 flex items-center justify-between text-sm">
              {errors.password ? (
                <p className="text-red-600">{errors.password}</p>
              ) : (
                <p className="text-slate-500">Use at least 6 characters.</p>
              )}
              <span className={`font-semibold ${strengthClass}`}>
                {passwordStrength}
              </span>
            </div>
          </div>

          <div className="sm:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-semibold text-slate-700">
                Confirm password
              </label>
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="text-sm font-medium text-emerald-700 transition hover:text-emerald-900"
              >
                {showConfirmPassword ? "Hide" : "Show"}
              </button>
            </div>
            <input
              className={`w-full rounded-2xl border px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 ${errors.confirmPassword ? "border-red-400 bg-red-50" : "border-slate-200 bg-white"}`}
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {errors.confirmPassword && (
              <p className="mt-2 text-sm text-red-600">{errors.confirmPassword}</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Your account will be ready to track applications, interviews, offers, and rejections right after sign-up.
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Creating account..." : "Create Account"}
        </button>

        <p className="text-center text-sm text-slate-600">
          Already registered?{" "}
          <Link className="font-semibold text-emerald-700 transition hover:text-emerald-900" to="/login">
            Sign in here
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export default Register;
