/**
 * A minimal pub/sub for cross-cutting notification events — the same
 * pattern services/sessionEvents.ts already uses for the 401 case.
 * Feature hooks (use-applications.ts, use-profile.ts) that already know
 * "an application was created" / "a profile was updated" call `emit*`
 * here without importing React or NotificationContext; the
 * NotificationProvider (context/NotificationContext.tsx) is the only
 * subscriber, and turns each event into a persisted in-app notification.
 *
 * Kept separate from NotificationContext itself so plain service/hook
 * files (which aren't React components) can emit without a Provider in
 * scope — exactly why sessionEvents.ts is separate from AuthProvider.
 */

export type NotificationEvent =
  | { type: 'application_submitted'; role: string; company: string; trackedJobId: number }
  | { type: 'application_status_changed'; role: string; company: string; status: string; interviewDate?: string | null; trackedJobId: number }
  | { type: 'resume_updated' }
  | { type: 'resume_tailored'; versionId: number };

type Listener = (event: NotificationEvent) => void;

const listeners = new Set<Listener>();

export function onNotificationEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitNotificationEvent(event: NotificationEvent): void {
  for (const listener of listeners) listener(event);
}
