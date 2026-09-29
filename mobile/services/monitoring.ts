/**
 * Crash / error monitoring (Sentry — free developer tier; entirely optional).
 *
 * Environment-safe: with no EXPO_PUBLIC_SENTRY_DSN nothing is initialised and
 * the app runs identically. The DSN is a public identifier, not a secret; the
 * upload token used for source maps is an EAS secret and never ships in the app.
 *
 * Privacy: sendDefaultPii is off, request bodies/headers/cookies are dropped,
 * console + network breadcrumbs are dropped, the user is identified by numeric
 * id only, and every event is scrubbed with the same redaction as logger.ts.
 */
import * as Sentry from '@sentry/react-native';

import { APP_ENV, IS_DEV, SENTRY_DSN } from '@/services/config';
import { redact, scrubString, setErrorReporter } from '@/services/logger';
import { ApiError } from '@/types/api';

let enabled = false;

function scrubEvent<T extends object>(event: T): T {
  const e = event as Record<string, any>;
  delete e.request;
  if (e.user) e.user = { id: e.user.id };
  if (e.extra) e.extra = redact(e.extra);
  if (e.contexts) e.contexts = redact(e.contexts);
  if (e.message) e.message = scrubString(String(e.message));
  e.exception?.values?.forEach((v: Record<string, any>) => {
    if (v.value) v.value = scrubString(String(v.value));
  });
  return event;
}

export function initMonitoring(): boolean {
  if (enabled || !SENTRY_DSN) return enabled;
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: APP_ENV,
    enabled: !IS_DEV,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 30,
    attachScreenshot: false,
    attachViewHierarchy: false,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (b) => (b.category === 'console' || b.category === 'xhr' || b.category === 'fetch' ? null : b),
  });
  setErrorReporter((error, context) => {
    // Expected, user-facing API failures (bad password, offline, 4xx) are not crashes.
    if (error instanceof ApiError && (error.status === null || error.status < 500)) return;
    Sentry.withScope((scope) => {
      if (context) scope.setContext('detail', context);
      Sentry.captureException(error instanceof ApiError ? new Error(`API ${error.status ?? 'network'} ${error.apiCode ?? ''}`.trim()) : error);
    });
  });
  enabled = true;
  return true;
}

/** Identify by numeric id only — never email or name. */
export function setMonitoringUser(id: number | null): void {
  if (!enabled) return;
  Sentry.setUser(id == null ? null : { id: String(id) });
}

/** Wraps the root component so render crashes are captured. Identity when disabled. */
export function wrapRootComponent<T extends React.ComponentType<any>>(component: T): T {
  return (SENTRY_DSN ? (Sentry.wrap(component) as unknown as T) : component);
}
