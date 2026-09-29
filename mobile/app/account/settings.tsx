import * as Application from 'expo-application';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, TextInput } from 'react-native';

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
import { DELETE_ACCOUNT_URL } from '@/services/config';
import { sendTestPush } from '@/services/pushApi';
import { ApiError } from '@/types/api';

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
  const { logout, deleteAccount } = useAuth();
  const profile = useProfile();
  const gmail = useGmailStatus();
  const { preferences, update, error: prefError } = useNotificationPreferences();
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const onDelete = async () => {
    if (!password) return setDeleteError('Enter your password to confirm.');
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount(password); // signs out on success; the router switches to the login screen
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Could not delete your account. Please try again.');
      setDeleting(false);
    }
  };

  const onTestPush = async () => {
    setTestMessage('Sending…');
    try {
      const r = await sendTestPush();
      setTestMessage(r.sent > 0 ? 'Test notification sent.' : 'Could not deliver the test notification.');
    } catch (err) {
      setTestMessage(err instanceof ApiError ? err.message : 'Could not send the test notification.');
    }
  };

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
            label="Interview reminders"
            value={preferences.interviewReminders}
            disabled={!preferences.pushEnabled}
            onValueChange={(value) => update({ interviewReminders: value })}
          />
          <ToggleRow
            label="Application follow-ups"
            value={preferences.applicationReminders}
            disabled={!preferences.pushEnabled}
            onValueChange={(value) => update({ applicationReminders: value })}
          />
          <ToggleRow
            label="New job matches"
            value={preferences.jobReminders}
            disabled={!preferences.pushEnabled}
            onValueChange={(value) => update({ jobReminders: value })}
          />
        </Card>
        {prefError ? (
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
            {prefError instanceof Error ? prefError.message : 'Could not save your notification settings.'}
          </ThemedText>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">
          Reminders are sent to this account&apos;s devices at {String(preferences.reminderHour).padStart(2, '0')}:00 in your local time.
        </ThemedText>
        <Pressable accessibilityRole="button" onPress={onTestPush} style={[styles.row, { borderColor: theme.border }]}>
          <ThemedText type="default">Send a test notification</ThemedText>
        </Pressable>
        {testMessage ? (
          <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
            {testMessage}
          </ThemedText>
        ) : null}
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

      <ThemedView style={styles.section}>
        <SectionHeader title="Delete account" />
        <ThemedText type="small" themeColor="textSecondary">
          Permanently deletes your account, applications, resumes, tailoring history and Gmail connection. This cannot be undone.
        </ThemedText>
        {confirmDelete ? (
          <ThemedView style={styles.section}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              placeholder="Confirm with your password"
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel="Password to confirm account deletion"
              style={[styles.input, { borderColor: theme.border, color: theme.text }]}
            />
            {deleteError ? (
              <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
                {deleteError}
              </ThemedText>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: deleting }}
              disabled={deleting}
              onPress={onDelete}
              style={[styles.deleteButton, { backgroundColor: theme.danger, opacity: deleting ? 0.6 : 1 }]}>
              {deleting ? <ActivityIndicator color="#ffffff" /> : <ThemedText type="smallBold" style={styles.deleteText}>Permanently delete my account</ThemedText>}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setConfirmDelete(false);
                setPassword('');
                setDeleteError(null);
              }}
              style={styles.cancelButton}>
              <ThemedText type="smallBold" themeColor="textSecondary">Cancel</ThemedText>
            </Pressable>
          </ThemedView>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(true)} style={[styles.logoutButton, { borderColor: theme.danger }]}>
            <ThemedText type="smallBold" themeColor="danger">Delete account…</ThemedText>
          </Pressable>
        )}
        {DELETE_ACCOUNT_URL ? (
          <Pressable accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(DELETE_ACCOUNT_URL)} style={styles.cancelButton}>
            <ThemedText type="small" themeColor="tint">Data deletion information</ThemedText>
          </Pressable>
        ) : null}
      </ThemedView>

      <ThemedText type="caption" themeColor="textSecondary" style={styles.version}>
        TrackTrail {Application.nativeApplicationVersion ?? 'dev'} ({Application.nativeBuildVersion ?? '0'})
      </ThemedText>
    </ScrollView>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <ThemedView style={[styles.toggleRow, disabled && { opacity: 0.5 }]}>
      <ThemedText type="default" style={styles.toggleLabel}>{label}</ThemedText>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
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
    minHeight: 44,
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
  toggleLabel: { flexShrink: 1, paddingRight: Spacing.two },
  input: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, minHeight: 48, fontSize: 16 },
  deleteButton: { minHeight: 48, borderRadius: Spacing.two, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#ffffff' },
  cancelButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  version: { textAlign: 'center' },
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
