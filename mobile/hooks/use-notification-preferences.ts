/**
 * Device-local switches shown in Settings → Notifications. There is no
 * backend endpoint to persist these against the user's account (no
 * push-token registration route exists — see NotificationContext's
 * top comment), so they live in AsyncStorage on this device only, and
 * today they gate exactly one real thing: whether
 * services/notifications.ts's events turn into an in-app notification.
 * `pushEnabled` and `emailEnabled` are stored and surfaced honestly, but
 * have no wiring to an actual push/email pipeline yet — the UI does not
 * pretend otherwise (see the Settings screen's copy).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const STORAGE_KEY = '@tracktrail/notification-preferences';

export interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  interviewReminders: boolean;
  applicationReminders: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  pushEnabled: true,
  emailEnabled: true,
  interviewReminders: true,
  applicationReminders: true,
};

export function useNotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try {
          setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(raw) });
        } catch {
          // Ignore corrupt storage, keep defaults.
        }
      }
      setIsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (patch: Partial<NotificationPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...patch };
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return { preferences, update, isReady };
}
