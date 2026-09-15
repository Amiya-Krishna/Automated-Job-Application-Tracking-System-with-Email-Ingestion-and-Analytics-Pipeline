import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useCreateApplication } from '@/hooks/use-applications';
import { useConnectGmail, useDisconnectGmail, useScanGmail } from '@/hooks/use-gmail';
import { useGmailStatus } from '@/hooks/use-gmail-status';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import type { GmailScanResult } from '@/types/gmail';
import { ApiError } from '@/types/api';
import { parseJobEmail } from '@/utils/email-parser';

export default function ProfileScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const profile = useProfile();
  const gmail = useGmailStatus();

  const connectGmail = useConnectGmail();
  const disconnectGmailMutation = useDisconnectGmail();
  const scanGmail = useScanGmail();
  const createApplication = useCreateApplication();

  const [scanResults, setScanResults] = useState<GmailScanResult[] | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedResult, setAddedResult] = useState<{
    id: number;
    company: string;
    role: string;
    duplicate: boolean;
  } | null>(null);

  const handleConnectGmail = () => {
    connectGmail.mutate(undefined, {
      onSuccess: (outcome) => {
        if (outcome === 'connected') {
          Alert.alert('Gmail connected');
        } else if (outcome === 'no_refresh_token') {
          Alert.alert(
            "Couldn't finish connecting",
            "Google didn't return a fresh permission grant. Remove this app's access at myaccount.google.com/permissions and try again.",
          );
        } else if (outcome === 'error') {
          Alert.alert("Couldn't connect Gmail", 'Please try again.');
        }
        // 'cancelled' (user dismissed the browser sheet) needs no alert.
      },
      onError: (err) => {
        Alert.alert("Couldn't connect Gmail", err instanceof ApiError ? err.message : 'Please try again.');
      },
    });
  };

  const handleDisconnectGmail = () => {
    Alert.alert('Disconnect Gmail?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () => {
          setScanResults(null);
          disconnectGmailMutation.mutate(undefined, {
            onError: (err) =>
              Alert.alert('Failed to disconnect', err instanceof ApiError ? err.message : 'Please try again.'),
          });
        },
      },
    ]);
  };

  const handleScanGmail = () => {
    setAddedResult(null);
    scanGmail.mutate(undefined, {
      onSuccess: (messages) => {
        const parsed = messages.map((msg) => ({ ...msg, parsed: parseJobEmail(`${msg.subject}\n${msg.snippet}`) }));
        setScanResults(parsed);
        if (parsed.length === 0) {
          Alert.alert('No matching emails found in the last 30 days');
        }
      },
      onError: (err) => Alert.alert('Scan failed', err instanceof ApiError ? err.message : 'Please try again.'),
    });
  };

  const handleAddToPipeline = (item: GmailScanResult) => {
    setAddingId(item.id);
    createApplication.mutate(
      {
        company: item.parsed.company || 'Unknown company',
        role: item.parsed.role || 'Unknown role',
        status: item.parsed.status,
        interviewDate: item.parsed.interviewDate || null,
        notes: `From email: "${item.subject}"`,
        sourceName: 'gmail',
        externalJobId: item.id,
      },
      {
        // The backend's real response — { ...TrackedJobRecord, duplicate }
        // (server/routes/jobRoutes.js's POST /) — is the only source of
        // truth for where this landed and whether it's new. It already
        // does duplicate detection itself (findExistingTrackedJob,
        // matching this Gmail result against the user's existing tracked
        // jobs); this screen just has to surface what it decided rather
        // than re-deciding it or guessing.
        onSuccess: (result) => {
          setScanResults((prev) => prev?.filter((r) => r.id !== item.id) ?? null);
          setAddedResult({ id: result.id, company: result.company, role: result.role, duplicate: result.duplicate });
        },
        onError: (err) => Alert.alert('Failed to save', err instanceof ApiError ? err.message : 'Please try again.'),
        onSettled: () => setAddingId(null),
      },
    );
  };

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
              <ThemedView style={[styles.buttonRow, styles.editProfileButton]}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/account/edit')}
                  style={[styles.secondaryButton, { borderColor: theme.border }]}>
                  <ThemedText type="smallBold" themeColor="tint">
                    Edit profile
                  </ThemedText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/account/settings')}
                  style={[styles.secondaryButton, { borderColor: theme.border }]}>
                  <ThemedText type="smallBold">Settings</ThemedText>
                </Pressable>
              </ThemedView>
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
                <ThemedText type="small" themeColor="textSecondary">
                  Scan your inbox for interview invites, offers, and rejections, and add them to
                  your pipeline. Only read-only access is requested and email content is never
                  stored.
                </ThemedText>

                {gmail.data?.connected ? (
                  <ThemedView style={styles.buttonRow}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={scanGmail.isPending}
                      onPress={handleScanGmail}
                      style={[styles.secondaryButton, { borderColor: theme.border, opacity: scanGmail.isPending ? 0.7 : 1 }]}>
                      {scanGmail.isPending ? (
                        <ActivityIndicator color={theme.text} />
                      ) : (
                        <ThemedText type="smallBold">Scan inbox</ThemedText>
                      )}
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={disconnectGmailMutation.isPending}
                      onPress={handleDisconnectGmail}
                      style={[styles.secondaryButton, { borderColor: theme.border, opacity: disconnectGmailMutation.isPending ? 0.7 : 1 }]}>
                      <ThemedText type="smallBold" themeColor="danger">
                        Disconnect
                      </ThemedText>
                    </Pressable>
                  </ThemedView>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    disabled={connectGmail.isPending}
                    onPress={handleConnectGmail}
                    style={[styles.primaryButton, { backgroundColor: theme.tint, opacity: connectGmail.isPending ? 0.7 : 1 }]}>
                    {connectGmail.isPending ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <ThemedText type="smallBold" style={styles.primaryButtonText}>
                        Connect Gmail
                      </ThemedText>
                    )}
                  </Pressable>
                )}
              </ThemedView>
            </ThemedView>

            {addedResult ? (
              <ThemedView style={styles.section}>
                <ThemedView type="backgroundElement" style={[styles.confirmationCard, { borderColor: theme.tint }]}>
                  <ThemedText type="smallBold" themeColor="tint">
                    {addedResult.duplicate ? 'Already in Applications' : '✓ Added to Applications'}
                  </ThemedText>
                  <ThemedText type="small">{addedResult.role}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {addedResult.company}
                  </ThemedText>
                  <ThemedView style={styles.confirmationActions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        const id = addedResult.id;
                        setAddedResult(null);
                        router.push({ pathname: '/application/[id]', params: { id: String(id) } });
                      }}
                      style={[styles.primaryButton, styles.viewApplicationButton, { backgroundColor: theme.tint }]}>
                      <ThemedText type="smallBold" style={styles.primaryButtonText}>
                        View Application
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setAddedResult(null)}
                      style={styles.dismissButton}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Dismiss
                      </ThemedText>
                    </Pressable>
                  </ThemedView>
                </ThemedView>
              </ThemedView>
            ) : null}

            {scanResults && scanResults.length > 0 ? (
              <ThemedView style={styles.section}>
                <SectionHeader
                  title={`Found ${scanResults.length} matching email${scanResults.length === 1 ? '' : 's'}`}
                />
                {scanResults.map((item) => (
                  <ThemedView key={item.id} type="backgroundElement" style={styles.card}>
                    <ThemedText type="smallBold" numberOfLines={1}>
                      {item.subject || '(no subject)'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {item.from}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      Detected: {item.parsed.company || '—'} · {item.parsed.role || '—'} ·{' '}
                      {item.parsed.status}
                      {item.parsed.interviewDate ? ` · ${item.parsed.interviewDate}` : ''}
                    </ThemedText>
                    <Pressable
                      accessibilityRole="button"
                      disabled={addingId === item.id}
                      onPress={() => handleAddToPipeline(item)}
                      style={[
                        styles.primaryButton,
                        styles.addButton,
                        { backgroundColor: theme.tint, opacity: addingId === item.id ? 0.7 : 1 },
                      ]}>
                      {addingId === item.id ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <ThemedText type="smallBold" style={styles.primaryButtonText}>
                          Add to pipeline
                        </ThemedText>
                      )}
                    </Pressable>
                  </ThemedView>
                ))}
              </ThemedView>
            ) : null}
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
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  primaryButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryButtonText: {
    color: '#ffffff',
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  editProfileButton: {
    marginTop: Spacing.one,
  },
  addButton: {
    marginTop: Spacing.one,
  },
  confirmationCard: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  confirmationActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.two,
    backgroundColor: 'transparent',
  },
  viewApplicationButton: {
    flex: 1,
    marginTop: 0,
  },
  dismissButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
});
