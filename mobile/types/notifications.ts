/**
 * The in-app notification model. Entirely client-side: there is no
 * `notifications` table or route on the backend (verified by reading
 * every file under server/routes/), so these are generated locally —
 * either from real app events (see services/notifications.ts's emitters,
 * wired into use-applications.ts / use-profile.ts) or from the small
 * seeded set NotificationContext creates on first launch to demonstrate
 * the three example types the product spec calls for.
 */
export type NotificationKind = 'interview' | 'application' | 'resume' | 'system';

/**
 * Where tapping a notification should navigate, using the app's existing
 * Expo Router routes (no second navigation system). `params` are passed
 * to `router.push({ pathname, params })` as-is. Absent/omitted means the
 * notification has nowhere specific to go — tapping it just marks it read.
 */
export interface NotificationTarget {
  pathname: string;
  params?: Record<string, string>;
}

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string; // ISO timestamp
  read: boolean;
  target?: NotificationTarget;
}
