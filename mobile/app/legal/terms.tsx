/**
 * Template copy — replace with TrackTrail's actual terms of service
 * before shipping.
 */
import * as WebBrowser from 'expo-web-browser';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { TERMS_URL } from '@/services/config';

export default function TermsScreen() {
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {TERMS_URL ? (
          <Pressable accessibilityRole="link" accessibilityLabel="Open the full terms of service online" onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} style={styles.link}>
            <ThemedText type="smallBold" themeColor="tint">Open the full terms of service online</ThemedText>
          </Pressable>
        ) : null}
        <ThemedText type="smallBold">Using TrackTrail</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          TrackTrail is provided to help you track and discover job opportunities. You are
          responsible for the accuracy of the information you submit and for your own job
          applications.
        </ThemedText>
        <ThemedText type="smallBold">Automated features</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Some features (job matching, the automated apply engine, Gmail scanning) act on your
          behalf based on settings you control. You can disable Gmail sync at any time.
        </ThemedText>
        <ThemedText type="smallBold">Changes</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          We may update these terms from time to time; continued use of the app means you accept
          the current version.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  link: { minHeight: 44, justifyContent: 'center' },
});
