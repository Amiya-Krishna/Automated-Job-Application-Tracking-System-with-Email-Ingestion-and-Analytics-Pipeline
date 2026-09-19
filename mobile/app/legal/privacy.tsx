/**
 * Template copy — replace with TrackTrail's actual privacy policy before
 * shipping. Structure/sections are standard for an app that stores
 * account, profile, and (via optional Gmail sync) email-derived data.
 */
import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function PrivacyPolicyScreen() {
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          This is placeholder policy text — replace it with TrackTrail&apos;s actual privacy
          policy before release.
        </ThemedText>
        <ThemedText type="smallBold">What we collect</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Your account details (name, email), profile information you provide (resume text,
          skills, experience), and the applications and jobs you track. If you connect Gmail, we
          request read-only access to scan for job-related emails; email content is never stored.
        </ThemedText>
        <ThemedText type="smallBold">How we use it</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          To match you with relevant jobs, track your applications, and show your job-search
          analytics. We do not sell your data.
        </ThemedText>
        <ThemedText type="smallBold">Your controls</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          You can edit or delete your profile information at any time, and disconnect Gmail from
          the Profile tab whenever you like.
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
});
