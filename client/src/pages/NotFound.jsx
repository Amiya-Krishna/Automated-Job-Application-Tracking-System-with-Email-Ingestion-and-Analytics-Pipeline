import { Link } from "react-router-dom";

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(circle_at_top,_#dbeafe_0%,_#f8fafc_45%,_#eff6ff_100%)] px-4 text-center">
      <span className="inline-flex rounded-full bg-cyan-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-800">
        404
      </span>
      <h1 className="mt-6 text-4xl font-black tracking-tight text-slate-900">
        This page went off the grid.
      </h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
        The page you're looking for doesn't exist or may have moved. Let's
        get you back on track.
      </p>
      <Link
        to="/dashboard"
        className="mt-8 rounded-2xl bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}

export default NotFound;
