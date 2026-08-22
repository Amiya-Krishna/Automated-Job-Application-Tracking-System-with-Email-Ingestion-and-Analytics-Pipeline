export function LoadingSkeleton({ rows = 4 }) {
  return (
    <div className="space-y-3 p-5">
      {[...Array(rows)].map((_, i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800"
        />
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
        !
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        Something went wrong
      </p>
      <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600"
        >
          Try again
        </button>
      )}
    </div>
  );
}

const SOURCE_STYLES = {
  manual: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  extension: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  gmail: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  linkedin: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  indeed: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  engine: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};

export function SourceBadge({ source }) {
  const key = (source || "manual").toLowerCase();
  const style = SOURCE_STYLES[key] || SOURCE_STYLES.manual;
  const label = key.charAt(0).toUpperCase() + key.slice(1);
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${style}`}>
      {label}
    </span>
  );
}

const STATUS_STYLES = {
  applied: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  interview: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  offer: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  wishlist: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function StatusBadge({ status }) {
  const key = (status || "applied").toLowerCase();
  const style = STATUS_STYLES[key] || STATUS_STYLES.applied;
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : "Applied";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${style}`}>
      {label}
    </span>
  );
}
