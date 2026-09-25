// A minimal pub/sub for cross-cutting notification events — the same
// pattern the mobile app uses (mobile/services/notifications.ts). Plain
// page components (JobForm.jsx, Profile.jsx, ResumeTailoring.jsx) that
// already know "a job was submitted" / "a profile was saved" / "a
// tailoring session finished" call `emitNotificationEvent` here without
// importing the notification context; NotificationContext.jsx is the
// only subscriber, and turns each event into a persisted in-app
// notification.
//
// Event shapes intentionally mirror mobile/services/notifications.ts's
// NotificationEvent union exactly, so the same real actions produce the
// same notifications on both clients — this is genuinely the same
// concept ported, not a re-invented one.

const listeners = new Set();

export function onNotificationEvent(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitNotificationEvent(event) {
  for (const listener of listeners) listener(event);
}