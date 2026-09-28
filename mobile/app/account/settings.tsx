import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch } from 'react-native';

import { Card } from '@/components/card';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ThemeToggle } from '@/components/theme-toggle';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useGmailStatus } from '@/hooks/use-gmail-status';
import { useNotificationPreferences } from '@/hooks/use-notification-preferences';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';

/**
 * Settings screen, reached from the Profile tab and the drawer.
 * Registered as a sibling of `edit`/`gmail` inside the `account` Stack
 * (app/account/_layout.tsx).
 *
 * Deliberately does NOT contain "Edit profile" or "Change password":
 * Edit profile lives directly on the Profile tab (app/(drawer)/(tabs)/profile.tsx)
 * rather than being duplicated here, and there is no separate "change
 * password while logged in" concept in this app — the only password
 * recovery path is Sign in → Forgot password (app/(auth)/forgot-password.tsx),
 * which already reuses the same backend endpoint a "change password"
 * button here would have called, so keeping both would only be two
 * doors to the same room.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const { logout } = useAuth();
  const profile = useProfile();
  const gmail = useGmailStatus();
  const { preferences, update } = useNotificationPreferences();

  if (profile.isLoading) {
    return <LoadingState label="Loading settings…" />;
  }
  if (profile.isError) {
    return <ErrorState error={profile.error} onRetry={profile.refetch} />;
  }

  const displayName = profile.data?.full_name || 'Your account';
  const displayEmail = profile.data?.email || null;
  const gmailConnected = Boolean(gmail.data?.connected);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <ThemedView style={styles.section}>
        <SectionHeader title="Account" />
        <Card style={styles.card}>
          <ThemedText type="smallBold">{displayName}</ThemedText>
          {displayEmail ? (
            <ThemedText type="small" themeColor="textSecondary">
              {displayEmail}
            </ThemedText>
          ) : null}
        </Card>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/account/gmail')}
          style={[styles.row, { borderColor: theme.border }]}>
          <ThemedView style={styles.rowText}>
            <ThemedText type="default">Gmail Integration</ThemedText>
            <ThemedText type="small" themeColor={gmailConnected ? 'tint' : 'textSecondary'}>
              {gmailConnected ? 'Connected' : 'Not connected'}
            </ThemedText>
          </ThemedView>
          <ThemedText type="small" themeColor="textSecondary">
            ›
          </ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedView style={styles.section}>
        <SectionHeader title="Preferences" />
        <Card style={styles.card}>
          <ThemedText type="smallBold">Appearance</ThemedText>
          <ThemeToggle />
        </Card>
        <Card style={styles.togglesCard}>
          <ToggleRow
            label="Push notifications"
            value={preferences.pushEnabled}
            onValueChange={(value) => update({ pushEnabled: value })}
          />
          <ToggleRow
            label="Email notifications"
            value={preferences.emailEnabled}
            onValueChange={(value) => update({ emailEnabled: value })}
          />
          <ToggleRow
            label="Interview reminders"
            value={preferences.interviewReminders}
            onValueChange={(value) => update({ interviewReminders: value })}
          />
          <ToggleRow
            label="Application reminders"
            value={preferences.applicationReminders}
            onValueChange={(value) => update({ applicationReminders: value })}
          />
        </Card>
        <ThemedText type="small" themeColor="textSecondary">
          These control the in-app Notifications tab today. Real push/email delivery needs a
          connected backend service and isn&apos;t wired up yet.
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.section}>
        <SectionHeader title="Support" />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/about')}
          style={[styles.row, { borderColor: theme.border }]}>
          <ThemedText type="default">About</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            ›
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/legal/privacy')}
          style={[styles.row, { borderColor: theme.border }]}>
          <ThemedText type="default">Privacy Policy</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            ›
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/legal/terms')}
          style={[styles.row, { borderColor: theme.border }]}>
          <ThemedText type="default">Terms</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            ›
          </ThemedText>
        </Pressable>
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

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <ThemedView style={styles.toggleRow}>
      <ThemedText type="default">{label}</ThemedText>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.border, true: theme.tint }}
        thumbColor="#ffffff"
      />
    </ThemedView>
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
    gap: Spacing.half,
  },
  togglesCard: {
    gap: Spacing.three,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
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
  rowText: {
    gap: 2,
    backgroundColor: 'transparent',
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
