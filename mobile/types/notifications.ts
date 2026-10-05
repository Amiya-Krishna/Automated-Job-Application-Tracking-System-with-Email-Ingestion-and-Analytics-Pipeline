/**
 * The in-app notification model. Notifications are stored on the server per account
 * (notifications.user_id, /api/notifications/inbox) and are never shared between users.
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
