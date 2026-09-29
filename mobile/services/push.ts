/**
 * Expo push notifications (native side): permission, Android channels, Expo push
 * token, device registration with the backend, and unregistering on sign-out.
 *
 * Push does not work in Expo Go (SDK 53+) nor on simulators/emulators without
 * Google Play; every entry point degrades to a no-op there instead of throwing.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { getAppInfo } from '@/services/config';
import { logger } from '@/services/logger';
import { registerDevice, unregisterDevice } from '@/services/pushApi';

// Stored in SecureStore (not AsyncStorage): a push token is an address anyone could use to send this device notifications.
const TOKEN_KEY = 'push_token';

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
export const isPushSupported = !isExpoGo && Device.isDevice;

let handlerSet = false;
/** Foreground behaviour: show a banner + add to the list, silently. Call once at startup. */
export function configureNotificationHandler(): void {
  if (handlerSet || isExpoGo) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', { name: 'General', importance: Notifications.AndroidImportance.DEFAULT });
  await Notifications.setNotificationChannelAsync('reminders', {
    name: 'Reminders',
    description: 'Interview, follow-up and job match reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
  });
}

export async function getPushPermission(): Promise<PushPermission> {
  if (!isPushSupported) return 'unsupported';
  const p = await Notifications.getPermissionsAsync();
  return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
}

/** Shows the OS permission prompt (only if still allowed). Call from a user action. */
export async function requestPushPermission(): Promise<PushPermission> {
  if (!isPushSupported) return 'unsupported';
  await ensureAndroidChannels();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'denied';
  const next = await Notifications.requestPermissionsAsync();
  return next.granted ? 'granted' : next.canAskAgain ? 'undetermined' : 'denied';
}

/**
 * Registers this device with the backend if permission is already granted.
 * Never prompts. Returns the token, or null if push is unavailable/not allowed.
 */
export async function registerForPushIfPermitted(): Promise<string | null> {
  try {
    if ((await getPushPermission()) !== 'granted') return null;
    await ensureAndroidChannels();
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const info = getAppInfo();
    await registerDevice({
      expoPushToken: token,
      platform: info.platform,
      deviceName: info.deviceName,
      appVersion: info.version,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    });
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    return token;
  } catch (e) {
    logger.warn('push registration failed', e);
    return null;
  }
}

/** Removes this device from the account (sign-out / push turned off). Best effort. */
export async function unregisterPushDevice(): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return;
    await unregisterDevice(token);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (e) {
    logger.warn('push unregister failed', e);
  }
}

export async function forgetLocalPushToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
}

/** Re-registers when the OS rotates the push token. Returns an unsubscribe function. */
export function watchPushTokenChanges(): () => void {
  if (!isPushSupported) return () => {};
  const sub = Notifications.addPushTokenListener(() => {
    void registerForPushIfPermitted();
  });
  return () => sub.remove();
}
