/**
 * Tiny pub/sub so services/api.ts can announce "the session is over" without
 * importing navigation or auth state. AuthProvider is the subscriber.
 */
type UnauthorizedListener = () => void;

const listeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitUnauthorized(): void {
  for (const listener of listeners) listener();
}
