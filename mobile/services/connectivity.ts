/**
 * Tiny, dependency-free connectivity state. services/network.ts (native) feeds
 * it; the API client reads it so an offline request fails instantly with a
 * useful message instead of hanging for the full request timeout.
 * `null` = unknown (treated as online).
 */
let online: boolean | null = null;
const listeners = new Set<(online: boolean) => void>();

export const isOffline = () => online === false;
export const getOnline = () => online;

export function setOnline(next: boolean): void {
  if (online === next) return;
  online = next;
  for (const l of listeners) l(next);
}

export function subscribeConnectivity(listener: (online: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
