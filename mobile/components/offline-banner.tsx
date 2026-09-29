import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { isOffline, subscribeConnectivity } from '@/services/connectivity';

/** Slim, always-visible notice while the device is offline. Cached data keeps working underneath. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(isOffline());
  const insets = useSafeAreaInsets();

  useEffect(() => subscribeConnectivity((online) => setOffline(!online)), []);
  if (!offline) return null;

  return (
    <ThemedView style={[styles.banner, { paddingTop: insets.top + Spacing.one }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <ThemedText type="caption" style={styles.text} maxFontSizeMultiplier={1.2}>
        You&apos;re offline — showing saved data. Changes need a connection.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, backgroundColor: '#92400e', paddingBottom: Spacing.one, paddingHorizontal: Spacing.three, alignItems: 'center' },
  text: { color: '#ffffff', textAlign: 'center' },
});
