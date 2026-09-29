/**
 * In-app notification center: list + unread badge, persisted per device.
 *
 * Sources:
 *   - local events from real actions (services/notifications.ts emitters)
 *   - remote pushes (reminders sent by the backend) received while the app is
 *     open, or opened from the system tray (see components/notification-link-handler.tsx)
 *
 * The list contains company/role names, so it belongs to the signed-in user:
 * it is cleared on sign-out. There is no seeded/demo content.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { onNotificationEvent, type NotificationEvent } from '@/services/notifications';
import { isPushSupported } from '@/services/push';
import type { AppNotification, NotificationKind } from '@/types/notifications';
import { resolveNotificationTarget } from '@/utils/deep-links';

const STORAGE_KEY = '@tracktrail/notifications';

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const MAX_ITEMS = 100;

/** Turns a received push into a list item; the target is validated against the deep-link allow-list. */
export function notificationFromPush(n: Notifications.Notification): AppNotification | null {
  const { title, body, data } = n.request.content;
  if (!title && !body) return null;
  const type = (data as { type?: string } | null)?.type;
  const kind: NotificationKind = type === 'interview' ? 'interview' : type === 'application' || type === 'job' ? 'application' : 'system';
  const href = resolveNotificationTarget(data);
  const rawTarget = (data as { target?: { pathname?: string; params?: Record<string, string> } } | null)?.target;
  return {
    id: `push-${n.request.identifier}`,
    kind,
    title: String(title ?? 'TrackTrail').slice(0, 200),
    body: String(body ?? '').slice(0, 500),
    createdAt: new Date(n.date).toISOString(),
    read: false,
    target: href && rawTarget?.pathname ? { pathname: rawTarget.pathname, params: rawTarget.params } : undefined,
  };
}

function fromEvent(event: NotificationEvent): Omit<AppNotification, 'id' | 'createdAt' | 'read'> | null {
  switch (event.type) {
    case 'application_submitted':
      return {
        kind: 'application',
        title: 'Application submitted',
        body: `${event.role} at ${event.company} was added to your pipeline.`,
        target: { pathname: '/application/[id]', params: { id: String(event.trackedJobId) } },
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
        target: { pathname: '/application/[id]', params: { id: String(event.trackedJobId) } },
      };
    }
    case 'resume_updated':
      return {
        kind: 'resume',
        title: 'Resume updated',
        body: 'Your profile now reflects your latest resume details.',
        target: { pathname: '/resumes' },
      };
    case 'resume_tailored':
      return {
        kind: 'resume',
        title: 'Tailored resume ready',
        body: 'A tailored version of your resume is ready to review.',
        target: { pathname: '/tailor', params: { versionId: String(event.versionId) } },
      };
    default:
      return null;
  }
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  isReady: boolean;
  /** Adds a notification the user opened from the system tray (deduped by id). */
  addFromPush: (n: Notifications.Notification) => void;
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
          setNotifications([]);
        }
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
      setNotifications((prev) => [{ id: makeId(), createdAt: new Date().toISOString(), read: false, ...built }, ...prev].slice(0, MAX_ITEMS));
    });
  }, []);

  // Pushes that arrive while the app is open.
  useEffect(() => {
    if (!isPushSupported) return;
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const item = notificationFromPush(n);
      if (!item) return;
      setNotifications((prev) => (prev.some((x) => x.id === item.id) ? prev : [item, ...prev].slice(0, MAX_ITEMS)));
    });
    return () => sub.remove();
  }, []);

  // The list holds the signed-in user's application details: clear it when they sign out
  // (or their session ends) so the next person on this device never sees it.
  const wasAuthenticated = useRef(false);
  useEffect(() => {
    if (status === 'authenticated') wasAuthenticated.current = true;
    else if (status === 'unauthenticated' && wasAuthenticated.current) {
      wasAuthenticated.current = false;
      setNotifications([]);
    }
  }, [status]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
      isReady,
      addFromPush: (n) => {
        const item = notificationFromPush(n);
        if (item) setNotifications((prev) => (prev.some((x) => x.id === item.id) ? prev : [{ ...item, read: true }, ...prev].slice(0, MAX_ITEMS)));
      },
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
