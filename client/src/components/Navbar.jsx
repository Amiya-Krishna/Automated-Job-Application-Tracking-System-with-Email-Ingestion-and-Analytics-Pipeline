import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { clearStoredToken } from "../utils/auth";
import toast from "react-hot-toast";
import ThemeToggle from "./ThemeToggle";

// Nav restructured around the user's workflow (Overview / Job Discovery /
// Matched Jobs / Applied Jobs / Companies / Sources / Analytics / Profile)
// rather than raw table names — see App.jsx for the matching route
// changes and redirects from the old paths.
const primaryLinks = [
  { to: "/dashboard", label: "Overview" },
];

const engineLinks = [
  { to: "/job-discovery", label: "Job Discovery", hint: "scrape_runs" },
  { to: "/matched-jobs", label: "Matched Jobs", hint: "jobs · match_scores" },
  { to: "/applied-jobs", label: "Applied Jobs", hint: "tracked_jobs" },
  { to: "/companies", label: "Companies", hint: "companies" },
  { to: "/sources", label: "Sources", hint: "job_sources" },
];

const trailingLinks = [
  { to: "/analytics", label: "Analytics" },
  { to: "/integrations", label: "Integrations" },
  { to: "/profile", label: "Profile" },
];

function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [engineOpen, setEngineOpen] = useState(false);
  const engineRef = useRef(null);

  const logout = () => {
    clearStoredToken();
    toast.success("Signed out");
    navigate("/login");
  };

  const isActive = (to) => location.pathname === to;
  const isEngineActive = engineLinks.some((link) => isActive(link.to));

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (engineRef.current && !engineRef.current.contains(e.target)) {
        setEngineOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 dark:border-slate-700/70 bg-white/80 dark:bg-slate-900/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/dashboard" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white">
            TT
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
            TrackTrail
          </span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {primaryLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                isActive(link.to)
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {link.label}
            </Link>
          ))}

          {/* Engine pages (jobs, match_scores, applications, companies, job_sources) */}
          <div className="relative" ref={engineRef}>
            <button
              type="button"
              onClick={() => setEngineOpen((prev) => !prev)}
              className={`flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                isEngineActive
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              Engine
              <svg
                className={`h-3.5 w-3.5 transition ${engineOpen ? "rotate-180" : ""}`}
                viewBox="0 0 12 12"
                fill="none"
              >
                <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {engineOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 shadow-xl">
                {engineLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setEngineOpen(false)}
                    className={`block rounded-xl px-3 py-2 text-sm font-semibold transition ${
                      isActive(link.to)
                        ? "bg-slate-950 text-white"
                        : "text-slate-700 dark:text-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {link.label}
                    <span
                      className={`ml-2 text-[10px] font-medium ${
                        isActive(link.to) ? "text-slate-300" : "text-slate-400 dark:text-slate-500"
                      }`}
                    >
                      {link.hint}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {trailingLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                isActive(link.to)
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {link.label}
            </Link>
          ))}

          <Link
            to="/add-job"
            className="ml-2 rounded-full bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500"
          >
            + Add Job
          </Link>

          <ThemeToggle className="ml-1" />

          <button
            onClick={logout}
            className="ml-1 rounded-full border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            Logout
          </button>
        </nav>

        <div className="flex items-center gap-2 sm:hidden">
          <ThemeToggle />
          <button
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Toggle menu"
          >
            <span className="text-lg">{menuOpen ? "✕" : "☰"}</span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 sm:hidden">
          <div className="flex flex-col gap-1">
            <Link
              to="/add-job"
              onClick={() => setMenuOpen(false)}
              className="rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white"
            >
              + Add Job
            </Link>
            {[...primaryLinks, ...engineLinks, ...trailingLinks].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
                  isActive(link.to)
                    ? "bg-slate-950 text-white"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <button
              onClick={logout}
              className="rounded-xl px-4 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

export default Navbar;
