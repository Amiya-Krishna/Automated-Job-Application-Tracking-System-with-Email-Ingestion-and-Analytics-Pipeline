import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../context/NotificationContext";

const KIND_ICON = {
  interview: "📅",
  application: "📨",
  resume: "📄",
  system: "🔔",
};

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, remove } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Tap = mark read + go to the relevant page. `to` is just a react-router
  // path (see NotificationContext.jsx's fromEvent). A missing/malformed
  // `to`, or a route for an entity that's since been deleted, never
  // crashes the app: react-router simply renders whatever that route
  // renders for a since-deleted id (e.g. edit-job's own "job not found"
  // handling), so the worst case is a normal in-app 404/empty state, not
  // a broken link.
  const openNotification = (n) => {
    markAsRead(n.id);
    setOpen(false);
    if (n.to) navigate(n.to);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-xl">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-xs font-semibold text-cyan-600 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              You're all caught up.
            </p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`group flex items-start gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
                    !n.read ? "bg-cyan-50/60 dark:bg-cyan-950/30" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className="flex flex-1 items-start gap-2 text-left"
                  >
                    <span className="text-lg leading-none">{KIND_ICON[n.kind] || KIND_ICON.system}</span>
                    <span className="flex-1">
                      <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {n.title}
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                        {n.body}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-slate-500">
                        {timeAgo(n.createdAt)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(n.id)}
                    aria-label="Delete notification"
                    className="text-slate-400 opacity-0 transition hover:text-slate-700 dark:hover:text-slate-200 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;