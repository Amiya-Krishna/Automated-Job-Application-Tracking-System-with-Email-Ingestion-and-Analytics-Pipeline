import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useGmailStatus } from '@/hooks/use-gmail-status';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';

/**
 * Profile — identity + "who am I / what's connected" at a glance.
 *
 * Edit Profile lives directly here (not nested inside Settings — see
 * app/account/settings.tsx's comment for why it was removed from there).
 * Gmail integration is its own dedicated screen (app/account/gmail.tsx),
 * reached via the row below, rather than inlined here or buried in
 * Settings: this screen only shows its connection status at a glance.
 */
export default function ProfileScreen() {
  const theme = useTheme();
  const { user, logout, isAdmin } = useAuth();
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
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';
  const gmailConnected = Boolean(gmail.data?.connected);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Profile" />

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
            <ThemedView type="backgroundElement" style={styles.identityCard}>
              <ThemedView style={[styles.avatar, { backgroundColor: theme.tint }]}>
                <ThemedText type="smallBold" style={styles.avatarText}>
                  {initial}
                </ThemedText>
              </ThemedView>
              <ThemedView style={styles.identityText}>
                <ThemedText type="smallBold">{displayName}{isAdmin ? '  ·  Admin' : ''}</ThemedText>
                {displayEmail ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {displayEmail}
                  </ThemedText>
                ) : null}
              </ThemedView>
            </ThemedView>

            <ThemedView style={styles.buttonRow}>
              <Button label="Edit profile" grow onPress={() => router.push('/account/edit')} />
              <Button label="Settings" variant="secondary" grow onPress={() => router.push('/account/settings')} />
            </ThemedView>

            <ThemedView style={styles.section}>
              <SectionHeader title="Connected" />
              <NavRow
                label="Gmail Integration"
                sublabel={gmailConnected ? 'Connected' : 'Not connected'}
                sublabelColor={gmailConnected ? 'tint' : 'textSecondary'}
                onPress={() => router.push('/account/gmail')}
              />
              <NavRow label="My Resumes" sublabel="Uploads & tailored versions" onPress={() => router.push('/resumes')} />
            </ThemedView>

            <ThemedView style={styles.section}>
              <SectionHeader title="Skills" />
              <ThemedView type="backgroundElement" style={styles.card}>
                {profile.data?.skills.length ? (
                  <ThemedText type="small">{profile.data.skills.join(', ')}</ThemedText>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    No skills added yet — add them from Edit profile.
                  </ThemedText>
                )}
              </ThemedView>
            </ThemedView>

            <Button label="Log out" variant="danger" fullWidth onPress={() => logout()} />
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function NavRow({
  label,
  sublabel,
  sublabelColor = 'textSecondary',
  onPress,
}: {
  label: string;
  sublabel?: string;
  sublabelColor?: 'tint' | 'textSecondary';
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.navRow, { borderColor: theme.border }]}>
      <ThemedView style={styles.navRowText}>
        <ThemedText type="default">{label}</ThemedText>
        {sublabel ? (
          <ThemedText type="small" themeColor={sublabelColor}>
            {sublabel}
          </ThemedText>
        ) : null}
      </ThemedView>
      <ThemedText type="small" themeColor="textSecondary">
        ›
      </ThemedText>
    </Pressable>
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
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.three,
    padding: Spacing.four,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 20,
  },
  identityText: {
    flex: 1,
    gap: 2,
    backgroundColor: 'transparent',
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
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    minHeight: 52,
  },
  navRowText: {
    gap: 2,
    backgroundColor: 'transparent',
  },
});
