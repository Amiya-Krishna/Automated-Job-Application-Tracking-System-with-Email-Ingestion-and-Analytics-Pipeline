/**
 * A minimal pub/sub so api.ts can announce "the session is no longer
 * valid" (HTTP 401) without importing navigation, auth state, or
 * anything else that doesn't exist yet at this stage.
 *
 * Step 4 (authentication) / Step 5 (protected navigation) will subscribe
 * here to clear auth state and redirect to the login screen. Nothing
 * subscribes yet — api.ts's 401 handling below only clears the token and
 * emits the event; it deliberately does not decide what happens next.
 */

type UnauthorizedListener = () => void;

const listeners = new Set<UnauthorizedListener>();

/** Called by future auth/navigation code once it exists. Returns an unsubscribe function. */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called by api.ts's response interceptor when a request comes back 401. */
export function emitUnauthorized(): void {
  for (const listener of listeners) listener();
}
