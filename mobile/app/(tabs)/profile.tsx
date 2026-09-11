import { Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useGmailStatus } from '@/hooks/use-gmail-status';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';

export default function ProfileScreen() {
  const theme = useTheme();
  const { user, logout } = useAuth();
  const profile = useProfile();
  const gmail = useGmailStatus();

  const isLoading = profile.isLoading || gmail.isLoading;
  const isError = profile.isError || gmail.isError;
  const isRefetching = profile.isRefetching || gmail.isRefetching;
  const refetchAll = () => {
    profile.refetch();
    gmail.refetch();
  };

  // Prefer the freshly-fetched profile's name/email — it's always
  // up to date, whereas AuthProvider's `user` is only populated right
  // after a login response and is `null` after a cold restart (see
  // providers/AuthProvider.tsx's documented gap). Fall back to `user`
  // only if the profile row itself doesn't have a name/email set yet.
  const displayName = profile.data?.full_name || user?.name || 'Your account';
  const displayEmail = profile.data?.email || user?.email || null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="title" style={styles.title}>
          Profile
        </ThemedText>

        {isLoading ? (
          <LoadingState label="Loading your profile…" />
        ) : isError ? (
          <ErrorState error={profile.error ?? gmail.error} onRetry={refetchAll} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetchAll} tintColor={theme.tint} />
            }>
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{displayName}</ThemedText>
              {displayEmail ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {displayEmail}
                </ThemedText>
              ) : null}
            </ThemedView>

            <ThemedView style={styles.section}>
              <SectionHeader title="Skills" />
              <ThemedView type="backgroundElement" style={styles.card}>
                {profile.data?.skills.length ? (
                  <ThemedText type="small">{profile.data.skills.join(', ')}</ThemedText>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    No skills added yet.
                  </ThemedText>
                )}
              </ThemedView>
            </ThemedView>

            <ThemedView style={styles.section}>
              <SectionHeader title="Gmail integration" />
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="small" themeColor={gmail.data?.connected ? 'tint' : 'textSecondary'}>
                  {gmail.data?.connected ? 'Connected' : 'Not connected'}
                </ThemedText>
              </ThemedView>
            </ThemedView>

            {/* Never renders the JWT or any credential — only account-level
                info from GET /api/profile, per Step 5's security instructions. */}
            <Pressable
              accessibilityRole="button"
              onPress={() => logout()}
              style={[styles.logoutButton, { borderColor: theme.border }]}>
              <ThemedText type="smallBold" themeColor="danger">
                Log out
              </ThemedText>
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    gap: Spacing.three,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    paddingHorizontal: Spacing.four,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
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
  logoutButton: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
});
