import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "../api";
import AuthShell from "../components/AuthShell";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

function LoginForm({ role }) {
  const isAdminLogin = role === "admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();
  const { status, login, isAdmin, sessionNotice, clearSessionNotice } = useAuth();

  const [roleError, setRoleError] = useState("");
  const [blockedMessage, setBlockedMessage] = useState("");

  useEffect(() => {
    if (status === "authenticated") {
      navigate(isAdminLogin && isAdmin ? "/admin" : "/dashboard", { replace: true });
    }
  }, [navigate, status, isAdmin, isAdminLogin]);

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

      setRoleError("");
      setBlockedMessage("");
      clearSessionNotice?.();
      // `role` is only the door the person chose. The server checks it against the account's
      // real role (and refuses admin sign-in for non-admins); it is never trusted on its own.
      const res = await api.post("/auth/login", {
        email: email.trim(),
        password,
        rememberMe,
        role,
      });

      // Defence in depth: never start an admin session unless the server says admin.
      if (isAdminLogin && res.data?.user?.role !== "admin") {
        setRoleError("This account does not have administrator access.");
        return;
      }

      login(res.data);

      toast.success(`Welcome back, ${res.data.user.name}`);

      navigate(isAdminLogin ? "/admin" : "/dashboard");

    } catch (error) {
      const message = error.response?.data?.message || "Login failed";

      if (error.response?.data?.code === "admin_required") {
        setRoleError(message);
        return;
      }

      if (error.response?.status === 403 && error.response?.data?.code === "account_blocked") {
        setBlockedMessage(message);
        return;
      }

      toast.error(message);

      if (!isAdminLogin && message === "User not found") {
        navigate("/register");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      badge={isAdminLogin ? "Admin Sign-in" : "User Sign-in"}
      title={isAdminLogin ? "Administrator access." : "Track every application with less chaos."}
      subtitle={isAdminLogin
        ? "Manage accounts, roles, job sources and discovery. Only accounts with the administrator role can sign in here."
        : "Sign in to manage interviews, offers, and follow-ups from one focused dashboard."}
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
      accentClass={isAdminLogin ? "bg-rose-100 text-rose-800" : "bg-cyan-100 text-cyan-800"}
    >
      <form
        className="max-w-xl space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          handleLogin();
        }}
      >
        <Link to="/login" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
          <span aria-hidden="true">←</span> Change role
        </Link>

        {(blockedMessage || sessionNotice?.kind === "blocked") && (
          <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {blockedMessage || sessionNotice?.message || "Your account has been blocked. Please contact an administrator."}
          </div>
        )}

        {roleError && (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {roleError}{" "}
            {isAdminLogin && <Link to="/login/user" className="font-semibold underline">Go to User sign-in</Link>}
          </div>
        )}

        <div className="grid gap-5">
          <div>
            <label htmlFor="login-email" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Email address
            </label>
            <input
              id="login-email"
              className={`w-full rounded-2xl border px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 ${errors.email ? "border-red-400 dark:border-red-500/60 bg-red-50 dark:bg-red-950/30" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"}`}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors.email && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.email}</p>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="login-password" className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
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
              id="login-password"
              className={`w-full rounded-2xl border px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 ${errors.password ? "border-red-400 dark:border-red-500/60 bg-red-50 dark:bg-red-950/30" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"}`}
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {errors.password && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.password}</p>
            )}
            <div className="mt-2 text-right">
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-cyan-700 transition hover:text-cyan-900"
              >
                Forgot password?
              </Link>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-sm text-slate-600 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-cyan-600 focus:ring-cyan-500"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            Keep me signed in on this device
          </label>

          <span className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            {isAdminLogin ? "Admin Access" : "Protected Access"}
          </span>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Signing in..." : isAdminLogin ? "Sign in as Admin" : "Sign in as User"}
        </button>

        {isAdminLogin ? (
          <p className="text-center text-sm text-slate-600 dark:text-slate-300">
            Admin accounts are granted by an existing administrator, not created here.
          </p>
        ) : (
          <p className="text-center text-sm text-slate-600 dark:text-slate-300">
            Need an account?{" "}
            <Link className="font-semibold text-cyan-700 transition hover:text-cyan-900" to="/register">
              Create one now
            </Link>
          </p>
        )}
      </form>
    </AuthShell>
  );
}

const ROLE_CARDS = [
  {
    role: "user",
    title: "User",
    text: "Track applications, match jobs, tailor your resume and follow up.",
    icon: "👤",
    ring: "hover:border-cyan-400 focus-visible:ring-cyan-300",
  },
  {
    role: "admin",
    title: "Admin",
    text: "Manage users and roles, job sources, companies and job discovery.",
    icon: "🛡️",
    ring: "hover:border-rose-400 focus-visible:ring-rose-300",
  },
];

function RoleChooser() {
  const { status, isAdmin, sessionNotice } = useAuth();
  if (status === "authenticated") return <Navigate to={isAdmin ? "/admin" : "/dashboard"} replace />;

  return (
    <AuthShell
      badge="Sign in"
      title="Who is signing in?"
      subtitle="Choose how you want to sign in. Your account's real role is always verified by the server."
      panelTitle="A cleaner workflow for your job search."
      panelText="Keep your pipeline visible, update statuses fast, and avoid losing opportunities in scattered notes and tabs."
      stats={[
        { label: "Status Views", value: "4" },
        { label: "Job Pipeline", value: "24/7" },
        { label: "Quick Updates", value: "1 Tap" },
      ]}
      highlights={[
        "Users get their own tracker, resumes and analytics.",
        "Admins also manage the shared job catalog and discovery.",
        "Admin access is enforced on the server, not just in the page.",
      ]}
      accentClass="bg-cyan-100 text-cyan-800"
    >
      {sessionNotice?.kind === "blocked" && (
        <div role="alert" className="mb-4 max-w-xl rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {sessionNotice.message || "Your account has been blocked. Please contact an administrator."}
        </div>
      )}
      <div className="grid max-w-xl gap-4 sm:grid-cols-2" role="group" aria-label="Choose sign-in type">
        {ROLE_CARDS.map((c) => (
          <Link
            key={c.role}
            to={`/login/${c.role}`}
            className={`group flex min-h-[10rem] flex-col rounded-3xl border-2 border-slate-200 bg-white p-5 text-left shadow-sm outline-none transition focus-visible:ring-4 dark:border-slate-700 dark:bg-slate-900 ${c.ring}`}
          >
            <span className="text-3xl" aria-hidden="true">{c.icon}</span>
            <span className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">{c.title}</span>
            <span className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{c.text}</span>
            <span className="mt-auto pt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Continue as {c.title} →</span>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-sm text-slate-600 dark:text-slate-300">
        New here?{" "}
        <Link className="font-semibold text-cyan-700 transition hover:text-cyan-900" to="/register">Create a user account</Link>
      </p>
    </AuthShell>
  );
}

// /login -> role chooser; /login/user and /login/admin -> the matching sign-in flow.
function Login() {
  const { role } = useParams();
  if (!role) return <RoleChooser />;
  if (role !== "user" && role !== "admin") return <Navigate to="/login" replace />;
  return <LoginForm key={role} role={role} />;
}

export default Login;
