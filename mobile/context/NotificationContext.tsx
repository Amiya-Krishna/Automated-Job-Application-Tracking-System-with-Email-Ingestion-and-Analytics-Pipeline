/**
 * In-app notification center: list + unread badge, BACKED BY THE SERVER and scoped to the
 * signed-in account.
 *
 * Every notification belongs to exactly one user (notifications.user_id); the API only returns,
 * counts, updates or deletes the caller's own rows. Nothing is persisted on the device any more:
 * the old AsyncStorage list was shared by every account that signed in on the same phone. The
 * legacy key is wiped on load and the in-memory list is dropped as soon as the account changes
 * or signs out.
 *
 * Sources:
 *   - local events from real actions (services/notifications.ts emitters) -> recorded on the server
 *   - reminders created by the backend (a push is sent too): a received/opened push just triggers
 *     a refresh, the server copy is the source of truth
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { onNotificationEvent, type NotificationEvent } from '@/services/notifications';
import {
  clearInbox,
  createInboxNotification,
  deleteInbox,
  fetchInbox,
  markAllInboxRead,
  markInboxRead,
  type InboxNotification,
} from '@/services/notificationsInbox';
import { isPushSupported } from '@/services/push';
import type { AppNotification, NotificationKind } from '@/types/notifications';
import { resolveNotificationTarget } from '@/utils/deep-links';

const LEGACY_STORAGE_KEY = '@tracktrail/notifications';
const POLL_MS = 60_000;

const fromServer = (n: InboxNotification): AppNotification => ({
  id: String(n.id),
  kind: n.kind,
  title: n.title,
  body: n.body,
  createdAt: n.createdAt,
  read: n.read,
  // only paths this app can actually open
  target: n.target && typeof n.target.pathname === 'string' && resolveNotificationTarget({ target: n.target }) ? n.target : undefined,
});

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
  /** A notification was opened from the system tray: re-sync (the server already holds it). */
  addFromPush: (n: Notifications.Notification) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  remove: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const userId = status === 'authenticated' ? (user?.id ?? null) : null;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isReady, setIsReady] = useState(false);
  const activeUser = useRef<number | null>(null);

  // The shared on-device list from earlier versions mixed accounts: wipe it.
  useEffect(() => {
    void AsyncStorage.removeItem(LEGACY_STORAGE_KEY).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetchInbox();
      // ignore a response that arrives after the account changed
      if (activeUser.current === userId) setNotifications(res.data.map(fromServer));
    } catch {
      // offline / transient: keep what we have, the next refresh retries
    } finally {
      if (activeUser.current === userId) setIsReady(true);
    }
  }, [userId]);

  // Account change / sign-out: forget the previous account's notifications immediately.
  useEffect(() => {
    activeUser.current = userId;
    setNotifications([]);
    setIsReady(false);
    if (!userId) return undefined;
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [userId, refresh]);

  // Local events from real actions -> recorded for the current user on the server.
  useEffect(() => {
    if (!userId) return undefined;
    return onNotificationEvent((event) => {
      const built = fromEvent(event);
      if (!built) return;
      void createInboxNotification(built)
        .then((row) => {
          if (row && activeUser.current === userId) setNotifications((prev) => [fromServer(row), ...prev.filter((x) => x.id !== String(row.id))]);
        })
        .catch(() => {
          // a missed in-app notification never blocks the action that caused it
        });
    });
  }, [userId]);

  // Pushes that arrive while the app is open: the server already stored it.
  useEffect(() => {
    if (!isPushSupported || !userId) return undefined;
    const sub = Notifications.addNotificationReceivedListener(() => void refresh());
    return () => sub.remove();
  }, [userId, refresh]);

  // Optimistic update, then tell the server; re-sync if that fails.
  const act = useCallback(
    (optimistic: (prev: AppNotification[]) => AppNotification[], request: () => Promise<unknown>) => {
      setNotifications(optimistic);
      void request().catch(() => void refresh());
    },
    [refresh],
  );

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
      isReady,
      addFromPush: () => void refresh(),
      markAsRead: (id) => act((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)), () => markInboxRead(Number(id))),
      markAllAsRead: () => act((prev) => prev.map((n) => ({ ...n, read: true })), () => markAllInboxRead()),
      remove: (id) => act((prev) => prev.filter((n) => n.id !== id), () => deleteInbox(Number(id))),
      clearAll: () => act(() => [], () => clearInbox()),
    }),
    [notifications, isReady, act, refresh],
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
