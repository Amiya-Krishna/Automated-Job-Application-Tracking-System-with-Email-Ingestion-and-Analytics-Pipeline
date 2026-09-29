import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { useNotifications } from '@/hooks/use-notifications';
import { isPushSupported } from '@/services/push';
import { consumePendingLink, setPendingLink } from '@/services/pendingLink';
import { resolveNotificationTarget } from '@/utils/deep-links';

/**
 * Opens the right screen when a notification is tapped — for all three cases:
 *   - app in the foreground/background (tap in the tray)
 *   - app fully closed (cold start: the response is read once the app is up)
 *   - user signed out: the target is remembered and opened right after sign-in
 * Renders nothing. Must be mounted inside NotificationProvider and the router.
 */
export function NotificationLinkHandler() {
  if (!isPushSupported) return null;
  return <Inner />;
}

function Inner() {
  const { status } = useAuth();
  const { addFromPush } = useNotifications();
  const response = Notifications.useLastNotificationResponse();
  const handledRef = useRef<string | null>(null);

  // A tap that arrived before sign-in is opened once authenticated.
  useEffect(() => {
    if (status !== 'authenticated') return;
    const pending = consumePendingLink();
    if (pending) setTimeout(() => safePush(pending), 0);
  }, [status]);

  useEffect(() => {
    if (!response || status === 'hydrating') return;
    const id = response.notification.request.identifier;
    if (handledRef.current === id) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    handledRef.current = id;

    addFromPush(response.notification);
    const href = resolveNotificationTarget(response.notification.request.content.data);
    if (!href) return;
    if (status === 'authenticated') safePush(href);
    else setPendingLink(href);
  }, [response, status, addFromPush]);

  return null;
}

function safePush(href: string) {
  try {
    router.push(href as never);
  } catch {
    // An unresolvable route must never crash the app; the user just stays where they are.
  }
}
