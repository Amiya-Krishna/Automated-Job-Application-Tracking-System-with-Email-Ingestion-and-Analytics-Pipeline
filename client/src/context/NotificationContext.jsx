// In-app notification center, BACKED BY THE SERVER and scoped to the signed-in account.
//
// Every notification belongs to exactly one user (notifications.user_id); the API only ever
// returns, counts, updates or deletes the caller's own rows (server/services/notificationService.js).
// Nothing is stored in the browser any more: the old localStorage list was shared by every
// account that signed in on the same browser, so one user's notifications showed up for the next.
// The legacy key is wiped on load, and the in-memory list is dropped the moment the account
// changes or signs out.
//
// Real actions elsewhere in the app (saving/editing a tracked job, saving a profile resume,
// finishing a tailoring session) still publish through services/notificationEvents.js; this file
// turns each event into a notification recorded for the current user.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import api from "../api";
import { useAuth } from "./AuthContext";
import { onNotificationEvent } from "../services/notificationEvents";

const LEGACY_STORAGE_KEY = "tracktrail-notifications";
const POLL_MS = 60_000;

// Converts a real NotificationEvent into the fields a notification needs.
// Kept as a pure mapping (event in, notification-shape out) so it's easy
// to see this list is exhaustive and each entry traces back to a real
// user action — never fabricated content. Mirrors mobile's `fromEvent`.
function fromEvent(event) {
  switch (event.type) {
    case "application_submitted":
      return {
        kind: "application",
        title: "Application submitted",
        body: `${event.role} at ${event.company} was added to your pipeline.`,
        to: `/edit-job/${event.trackedJobId}`,
      };
    case "application_status_changed": {
      const kind = event.status === "Interview" ? "interview" : "application";
      const bodySuffix = event.interviewDate ? ` on ${event.interviewDate}` : "";
      const title =
        event.status === "Interview"
          ? "Interview scheduled"
          : event.status === "Offer"
          ? "Offer received 🎉"
          : event.status === "Rejected"
          ? "Application update"
          : "Status updated";
      return {
        kind,
        title,
        body: `${event.role} at ${event.company} is now marked "${event.status}"${bodySuffix}.`,
        to: `/edit-job/${event.trackedJobId}`,
      };
    }
    case "resume_updated":
      return {
        kind: "resume",
        title: "Resume updated",
        body: "Your profile now reflects your latest resume details.",
        to: "/resumes",
      };
    case "resume_tailored":
      return {
        kind: "resume",
        title: "Tailored resume ready",
        body: "A tailored version of your resume is ready to review.",
        to: `/tailor?version=${event.versionId}`,
      };
    default:
      return null;
  }
}

const fromServer = (n) => ({
  id: n.id,
  kind: n.kind,
  title: n.title,
  body: n.body,
  read: Boolean(n.read),
  createdAt: n.createdAt,
  to: n.target && typeof n.target.to === "string" && n.target.to.startsWith("/") ? n.target.to : undefined,
});

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth(false);
  const userId = user?.id ?? null;
  const [notifications, setNotifications] = useState([]);
  const activeUser = useRef(null);

  useEffect(() => {
    try { window.localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await api.get("/notifications/inbox");
      // ignore a response that arrives after the account changed
      if (activeUser.current === userId) setNotifications((res.data?.data || []).map(fromServer));
    } catch { /* keep what we have; the next poll retries */ }
  }, [userId]);

  // Account change / sign-out: forget the previous account's notifications immediately.
  useEffect(() => {
    activeUser.current = userId;
    setNotifications([]);
    if (!userId) return undefined;
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) return undefined;
    return onNotificationEvent(async (event) => {
      const built = fromEvent(event);
      if (!built) return;
      try {
        const res = await api.post("/notifications/inbox", {
          kind: built.kind,
          title: built.title,
          body: built.body,
          target: built.to ? { to: built.to } : undefined,
        });
        if (activeUser.current === userId && res.data?.data) setNotifications((prev) => [fromServer(res.data.data), ...prev]);
      } catch { /* a missed in-app notification never blocks the action that caused it */ }
    });
  }, [userId]);

  // Optimistic updates; on failure re-sync from the server.
  const act = useCallback((optimistic, request) => {
    setNotifications(optimistic);
    Promise.resolve().then(request).catch(() => refresh());
  }, [refresh]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
      markAsRead: (id) => act((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)), () => api.post(`/notifications/inbox/${id}/read`)),
      markAllAsRead: () => act((prev) => prev.map((n) => ({ ...n, read: true })), () => api.post("/notifications/inbox/read-all")),
      remove: (id) => act((prev) => prev.filter((n) => n.id !== id), () => api.delete(`/notifications/inbox/${id}`)),
      clearAll: () => act(() => [], () => api.delete("/notifications/inbox")),
    }),
    [notifications, act]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within a NotificationProvider");
  return ctx;
}
