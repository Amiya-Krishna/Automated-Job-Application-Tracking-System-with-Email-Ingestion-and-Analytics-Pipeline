import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';

/**
 * Settings screen, reached from the Profile tab (app/(tabs)/profile.tsx).
 * Registered as a sibling of `edit` inside the `account` Stack
 * (app/account/_layout.tsx) — same non-tab Stack used for profile
 * editing, for the same routing reasons documented there.
 *
 * Only surfaces settings the app can actually back: account info/edit,
 * app/version info (from Expo constants), and logout. No appearance,
 * notification, or biometric toggles — the app has no manual theme
 * override (constants/theme.ts follows the system color scheme
 * automatically) and no such functionality exists yet.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const { user, logout } = useAuth();
  const profile = useProfile();

  // Same fallback order as the Profile tab: the freshly-fetched profile
  // row is the source of truth, AuthProvider's `user` is a fallback for
  // the gap right after a cold restart (see AuthProvider.tsx).
  const displayName = profile.data?.full_name || user?.name || 'Your account';
  const displayEmail = profile.data?.email || user?.email || null;

  const appVersion = Constants.expoConfig?.version ?? null;

  if (profile.isLoading) {
    return <LoadingState label="Loading settings…" />;
  }
  if (profile.isError) {
    return <ErrorState error={profile.error} onRetry={profile.refetch} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <ThemedView style={styles.section}>
        <SectionHeader title="Account" />
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">{displayName}</ThemedText>
          {displayEmail ? (
            <ThemedText type="small" themeColor="textSecondary">
              {displayEmail}
            </ThemedText>
          ) : null}
        </ThemedView>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/account/edit')}
          style={[styles.row, { borderColor: theme.border }]}>
          <ThemedText type="default">Edit profile</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            ›
          </ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedView style={styles.section}>
        <SectionHeader title="About" />
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">TrackTrail</ThemedText>
          {appVersion ? (
            <ThemedText type="small" themeColor="textSecondary">
              Version {appVersion}
            </ThemedText>
          ) : null}
        </ThemedView>
      </ThemedView>

      <Pressable
        accessibilityRole="button"
        onPress={() => logout()}
        style={[styles.logoutButton, { borderColor: theme.border }]}>
        <ThemedText type="smallBold" themeColor="danger">
          Log out
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
  },
  logoutButton: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
});
