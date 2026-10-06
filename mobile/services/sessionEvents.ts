/**
 * Tiny pub/sub so services/api.ts can announce "the session is over" without
 * importing navigation or auth state. AuthProvider is the subscriber.
 *
 * `reason` is optional and backward compatible: no argument means the generic
 * "session expired"; 'blocked' means an administrator blocked the account.
 */
export type UnauthorizedReason = 'blocked';
type UnauthorizedListener = (reason?: UnauthorizedReason) => void;

const listeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitUnauthorized(reason?: UnauthorizedReason): void {
  for (const listener of listeners) listener(reason);
}
