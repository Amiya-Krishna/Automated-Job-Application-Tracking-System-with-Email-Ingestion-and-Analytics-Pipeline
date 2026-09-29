/**
 * A protected deep link (e.g. a notification tap or an emailed link to an
 * application) that arrived while the user was signed out. It is remembered and
 * opened right after sign-in, so "log in first, then land where the link
 * pointed" works. In-memory only; never persisted.
 */
let pending: string | null = null;

export const setPendingLink = (href: string | null) => {
  pending = href;
};

export function consumePendingLink(): string | null {
  const v = pending;
  pending = null;
  return v;
}
