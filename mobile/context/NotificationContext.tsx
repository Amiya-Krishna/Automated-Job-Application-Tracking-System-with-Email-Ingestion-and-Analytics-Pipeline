/**
 * In-app notification center: list + unread badge count, persisted to
 * AsyncStorage per device (there is no backend endpoint for this — see
 * types/notifications.ts). Subscribes to services/notifications.ts so
 * real actions elsewhere in the app (submitting an application, an
 * outcome status change, a profile/resume update) surface here without
 * this file needing to know about applications, jobs, or profiles.
 *
 * Push delivery (a device actually buzzing while the app is closed)
 * needs `expo-notifications` plus a backend endpoint to store Expo push
 * tokens against a user — neither exists yet, so this intentionally
 * only covers the in-app list + local scheduled reminders (see
 * hooks/use-notification-preferences.ts for how Settings' toggles gate
 * this). Wiring real push is a backend + native-config task, not
 * something to fake with a client-only "ON/OFF" switch that does nothing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { onNotificationEvent, type NotificationEvent } from '@/services/notifications';
import type { AppNotification, NotificationKind } from '@/types/notifications';

const STORAGE_KEY = '@tracktrail/notifications';

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// The three example notifications called for in the product spec —
// shown once, on first launch, so the Notifications tab isn't empty
// before the user has done anything yet. Clearly distinguishable from
// real ones only by content, same as any other seeded demo data.
function seedNotifications(): AppNotification[] {
  const now = Date.now();
  return [
    {
      id: makeId(),
      kind: 'interview',
      title: 'Interview tomorrow',
      body: 'You have an interview coming up — check the Applications tab for details.',
      createdAt: new Date(now - 1000 * 60 * 30).toISOString(),
      read: false,
    },
    {
      id: makeId(),
      kind: 'application',
      title: 'Application submitted',
      body: 'Your application was added to your pipeline.',
      createdAt: new Date(now - 1000 * 60 * 60 * 5).toISOString(),
      read: false,
    },
    {
      id: makeId(),
      kind: 'resume',
      title: 'Resume updated',
      body: 'Your profile now reflects your latest resume details.',
      createdAt: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
      read: true,
    },
  ];
}

function fromEvent(event: NotificationEvent): Omit<AppNotification, 'id' | 'createdAt' | 'read'> | null {
  switch (event.type) {
    case 'application_submitted':
      return {
        kind: 'application',
        title: 'Application submitted',
        body: `${event.role} at ${event.company} was added to your pipeline.`,
      };
    case 'application_status_changed': {
      const kind: NotificationKind = event.status === 'Interview' ? 'interview' : 'application';
      const bodySuffix = event.interviewDate ? ` on ${event.interviewDate}` : '';
      return {
        kind,
        title:
          event.status === 'Interview'
            ? 'Interview scheduled'
            : event.status === 'Offer'
              ? 'Offer received 🎉'
              : event.status === 'Rejected'
                ? 'Application update'
                : 'Status updated',
        body: `${event.role} at ${event.company} is now marked "${event.status}"${bodySuffix}.`,
      };
    }
    case 'resume_updated':
      return {
        kind: 'resume',
        title: 'Resume updated',
        body: 'Your profile now reflects your latest resume details.',
      };
    default:
      return null;
  }
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  isReady: boolean;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  remove: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isReady, setIsReady] = useState(false);
  const hydratedRef = useRef(false);

  // Hydrate once. Not gated on auth status — the list is small, local,
  // device-scoped data; there's no per-user server data to leak across
  // accounts the way AuthProvider.tsx's queryClient.clear() worries about.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setNotifications(JSON.parse(raw));
        } catch {
          setNotifications(seedNotifications());
        }
      } else {
        setNotifications(seedNotifications());
      }
      setIsReady(true);
    });
  }, []);

  // Persist on every change, once hydration has actually happened (so we
  // never overwrite disk with an empty array before the initial read).
  useEffect(() => {
    if (!isReady) return;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  }, [notifications, isReady]);

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

  // Logging out clears nothing here on purpose — these are device
  // notifications, not tied to the specific account's server data.
  void status;

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
      isReady,
      markAsRead: (id) =>
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n))),
      markAllAsRead: () => setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))),
      remove: (id) => setNotifications((prev) => prev.filter((n) => n.id !== id)),
      clearAll: () => setNotifications([]),
    }),
    [notifications, isReady],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotificationContext(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotificationContext() must be called within <NotificationProvider>.');
  }
  return context;
}
