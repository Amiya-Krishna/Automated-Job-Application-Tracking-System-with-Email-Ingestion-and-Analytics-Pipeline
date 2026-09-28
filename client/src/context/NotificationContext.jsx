// In-app notification center: list + unread badge count, persisted to
// localStorage for this browser (there is no backend endpoint for this —
// same reasoning as mobile/types/notifications.ts: no `notifications`
// table/route exists on the backend). Subscribes to
// services/notificationEvents.js so real actions elsewhere in the app
// (submitting/editing a tracked job, saving a profile resume, finishing
// a tailoring session) surface here without this file needing to know
// about jobs, profiles, or tailoring.
//
// This is the SAME concept as mobile/context/NotificationContext.tsx —
// same event types, same "meaningful events only" rule, same safe-
// navigation-on-tap behaviour — ported to web's storage (localStorage
// instead of AsyncStorage) and routing (react-router `to` paths instead
// of Expo Router pathname/params). Deliberately NOT backed by a new
// server table/route: nothing here needs to be visible cross-device or
// survive a cleared browser, so a client-only store is the smallest
// correct implementation, exactly like the mobile version already is.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { onNotificationEvent } from "../services/notificationEvents";

const STORAGE_KEY = "tracktrail-notifications";

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

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

function readStored() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState(readStored);
  const hydratedRef = useRef(true); // localStorage read is synchronous, unlike AsyncStorage

  useEffect(() => {
    if (!hydratedRef.current) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    return onNotificationEvent((event) => {
      const built = fromEvent(event);
      if (!built) return;
      setNotifications((prev) => [
        { id: makeId(), createdAt: new Date().toISOString(), read: false, ...built },
        ...prev,
      ]);
    });
  }, []);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
      markAsRead: (id) =>
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n))),
      markAllAsRead: () => setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))),
      remove: (id) => setNotifications((prev) => prev.filter((n) => n.id !== id)),
      clearAll: () => setNotifications([]),
    }),
    [notifications]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within a NotificationProvider");
  return ctx;
}