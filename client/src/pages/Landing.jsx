import { Link } from "react-router-dom";

const features = [
  {
    title: "One pipeline, zero spreadsheets",
    text: "Log every application the moment you hit submit, and stop losing track of where things stand.",
  },
  {
    title: "Status at a glance",
    text: "See applied, interview, offer, and rejected counts update live as you move roles forward.",
  },
  {
    title: "Built-in analytics",
    text: "A breakdown chart shows exactly where your search is strongest — and where it's stalling.",
  },
  {
    title: "Secure by default",
    text: "Your data is scoped to your account with token-based authentication, so it's yours alone.",
  },
];

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_#dbeafe_0%,_#f8fafc_45%,_#eff6ff_100%)]">
      <div className="absolute inset-0 opacity-60">
        <div className="absolute -left-20 top-16 h-64 w-64 rounded-full bg-cyan-200/50 blur-3xl" />
        <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-blue-300/40 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white">
              TT
            </span>
            <span className="text-lg font-bold tracking-tight text-slate-900">
              TrackTrail
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white/60"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Get started
            </Link>
          </div>
        </header>

        <main className="mt-16 grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="inline-flex rounded-full bg-cyan-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-800">
              Career Command Center
            </span>

            <h1 className="mt-6 text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">
              Every application, interview, and offer — in one focused dashboard.
            </h1>

            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              TrackTrail replaces scattered spreadsheets and sticky notes with a
              single pipeline view of your job search, so you always know
              what to follow up on next.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/register"
                className="rounded-2xl bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Create your free account
              </Link>
              <Link
                to="/login"
                className="rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
              >
                I already have an account
              </Link>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-4 max-w-md">
              <div className="rounded-2xl border border-white/70 bg-white/70 p-4 backdrop-blur">
                <p className="text-2xl font-bold text-slate-900">4</p>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                  Status Views
                </p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/70 p-4 backdrop-blur">
                <p className="text-2xl font-bold text-slate-900">24/7</p>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                  Access
                </p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/70 p-4 backdrop-blur">
                <p className="text-2xl font-bold text-slate-900">1 Tap</p>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                  Status Updates
                </p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[32px] border border-white/70 bg-slate-950 p-8 text-white shadow-[0_24px_80px_rgba(15,23,42,0.25)]">
            <div className="absolute inset-0 bg-[linear-gradient(145deg,_rgba(34,197,94,0.18),_rgba(14,165,233,0.2),_rgba(15,23,42,0.95))]" />
            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-200">
                Why job-seekers use it
              </p>
              <div className="mt-6 space-y-4">
                {features.map((feature) => (
                  <div
                    key={feature.title}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <p className="text-sm font-semibold text-white">
                      {feature.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-300">
                      {feature.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>

        <footer className="mt-20 border-t border-slate-200/70 pt-6 text-center text-xs text-slate-500">
          Built with the MERN stack — MongoDB, Express, React, and Node.
        </footer>
      </div>
    </div>
  );
}

export default Landing;
