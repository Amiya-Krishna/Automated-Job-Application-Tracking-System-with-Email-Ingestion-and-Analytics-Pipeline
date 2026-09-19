import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch } from 'react-native';

import { Card } from '@/components/card';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ThemeToggle } from '@/components/theme-toggle';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useNotificationPreferences } from '@/hooks/use-notification-preferences';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { forgotPassword } from '@/services/auth';
import { ApiError } from '@/types/api';

/**
 * Settings screen, reached from the Profile tab and the drawer.
 * Registered as a sibling of `edit` inside the `account` Stack
 * (app/account/_layout.tsx).
 *
 * Appearance and Notifications are new (backed by ThemeContext and
 * useNotificationPreferences — both device-local, see those files'
 * comments for exactly what each toggle actually gates). Account and
 * App sections build on what already existed here.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const { user, logout } = useAuth();
  const profile = useProfile();
  const { preferences, update } = useNotificationPreferences();

  const [isSendingReset, setIsSendingReset] = useState(false);

  const displayName = profile.data?.full_name || user?.name || 'Your account';
  const displayEmail = profile.data?.email || user?.email || null;

  const handleChangePassword = async () => {
    if (!displayEmail) return;
    setIsSendingReset(true);
    try {
      // Reuses the exact same backend flow as the logged-out "Forgot
      // password" screen (app/(auth)/forgot-password.tsx) — there is no
      // separate "change password while logged in" endpoint (verified
      // by reading server/routes/authRoutes.js: only register/login/
      // forgot-password/reset-password exist), so this sends a reset
      // link to the account's own email instead of pretending otherwise.
      const redirectUri = Linking.createURL('reset-password');
      const { message } = await forgotPassword({ email: displayEmail, source: 'mobile', redirectUri });
      Alert.alert('Check your email', message);
    } catch (err) {
      Alert.alert('Something went wrong', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setIsSendingReset(false);
    }
  };

  if (profile.isLoading) {
    return <LoadingState label="Loading settings…" />;
  }
  if (profile.isError) {
    return <ErrorState error={profile.error} onRetry={profile.refetch} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <ThemedView style={styles.section}>
        <SectionHeader title="Appearance" />
        <ThemeToggle />
      </ThemedView>

      <ThemedView style={styles.section}>
        <SectionHeader title="Notifications" />
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
          onPress={() => router.push('/account/edit')}
          style={[styles.row, { borderColor: theme.border }]}>
          <ThemedText type="default">Edit profile</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            ›
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={isSendingReset || !displayEmail}
          onPress={handleChangePassword}
          style={[styles.row, { borderColor: theme.border, opacity: isSendingReset ? 0.6 : 1 }]}>
          <ThemedText type="default">Change password</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {isSendingReset ? 'Sending…' : '›'}
          </ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedView style={styles.section}>
        <SectionHeader title="App" />
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
  logoutButton: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
});
