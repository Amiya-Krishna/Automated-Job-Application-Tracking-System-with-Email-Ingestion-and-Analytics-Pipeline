function AuthShell({
  badge,
  title,
  subtitle,
  children,
  panelTitle,
  panelText,
  stats,
  highlights,
  accentClass,
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_#dbeafe_0%,_#f8fafc_45%,_#eff6ff_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="absolute inset-0 opacity-60">
        <div className="absolute -left-20 top-16 h-64 w-64 rounded-full bg-cyan-200/50 blur-3xl" />
        <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-blue-300/40 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
        <div className="grid w-full overflow-hidden rounded-[32px] border border-white/70 dark:border-slate-700/70 bg-white/80 dark:bg-slate-900/80 shadow-[0_24px_80px_rgba(15,23,42,0.15)] backdrop-blur xl:grid-cols-[1.05fr_0.95fr]">
          <section className="p-6 sm:p-10 lg:p-12">
            <span className={`inline-flex rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] ${accentClass}`}>
              {badge}
            </span>

            <div className="mt-6 max-w-xl">
              <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-5xl">
                {title}
              </h1>

              <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                {subtitle}
              </p>
            </div>

            <div className="mt-8">
              {children}
            </div>
          </section>

          <aside className="relative hidden overflow-hidden bg-slate-950 p-10 text-white xl:block">
            <div className="absolute inset-0 bg-[linear-gradient(145deg,_rgba(34,197,94,0.18),_rgba(14,165,233,0.2),_rgba(15,23,42,0.95))]" />

            <div className="relative flex h-full flex-col justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-200">
                  Career Command Center
                </p>

                <h2 className="mt-4 max-w-md text-3xl font-bold leading-tight">
                  {panelTitle}
                </h2>

                <p className="mt-4 max-w-lg text-sm leading-7 text-slate-300">
                  {panelText}
                </p>
              </div>

              <div className="space-y-8">
                <div className="grid grid-cols-3 gap-4">
                  {stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur"
                    >
                      <p className="text-2xl font-bold text-white">{stat.value}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-300">
                        {stat.label}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 rounded-3xl border border-white/10 bg-black/20 p-6">
                  {highlights.map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-sm text-slate-200"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default AuthShell;
