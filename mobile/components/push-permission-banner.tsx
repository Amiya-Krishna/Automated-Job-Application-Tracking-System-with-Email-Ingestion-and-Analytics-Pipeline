import * as Linking from 'expo-linking';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useNotificationPreferences } from '@/hooks/use-notification-preferences';
import { useTheme } from '@/hooks/use-theme';
import { getPushPermission, registerForPushIfPermitted, requestPushPermission, type PushPermission } from '@/services/push';

/**
 * Contextual permission prompt: shown on the Notifications tab only when push is
 * possible but not yet allowed. The OS dialog appears only after the user taps.
 */
export function PushPermissionBanner() {
  const theme = useTheme();
  const { preferences } = useNotificationPreferences();
  const [permission, setPermission] = useState<PushPermission>('unsupported');

  const refresh = useCallback(() => {
    getPushPermission().then(setPermission).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  if (permission === 'granted' || permission === 'unsupported' || !preferences.pushEnabled) return null;

  const onPress = async () => {
    if (permission === 'denied') {
      await Linking.openSettings();
      return;
    }
    const next = await requestPushPermission();
    setPermission(next);
    if (next === 'granted') await registerForPushIfPermitted();
  };

  return (
    <ThemedView type="backgroundElement" style={[styles.banner, { borderColor: theme.border }]}>
      <ThemedView style={styles.text}>
        <ThemedText type="smallBold">Get interview and follow-up reminders</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {permission === 'denied' ? 'Notifications are turned off for TrackTrail in your phone settings.' : 'Allow notifications so you never miss an interview.'}
        </ThemedText>
      </ThemedView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={permission === 'denied' ? 'Open phone settings' : 'Allow notifications'}
        onPress={onPress}
        style={[styles.button, { backgroundColor: theme.tint }]}>
        <ThemedText type="smallBold" style={styles.buttonText}>
          {permission === 'denied' ? 'Settings' : 'Allow'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  banner: { marginHorizontal: Spacing.four, borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  text: { flex: 1, gap: Spacing.half, backgroundColor: 'transparent' },
  button: { minHeight: 44, minWidth: 72, borderRadius: Spacing.two, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.three },
  buttonText: { color: '#ffffff' },
});
