import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCreateApplication } from '@/hooks/use-applications';
import { useConnectGmail, useDisconnectGmail, useScanGmail } from '@/hooks/use-gmail';
import { useGmailStatus } from '@/hooks/use-gmail-status';
import { useTheme } from '@/hooks/use-theme';
import type { GmailScanResult } from '@/types/gmail';
import { ApiError } from '@/types/api';
import { parseJobEmail } from '@/utils/email-parser';

/**
 * Gmail Integration, its own dedicated screen — reached from the Profile
 * tab ("Gmail Integration" row) rather than buried inline on Profile or
 * inside the generic Settings screen. All the connect/scan/disconnect
 * logic here previously lived directly on ProfileScreen; moved as-is
 * (same hooks, same backend calls — server/routes/gmailRoutes.js) so
 * behavior is unchanged, only the navigation surface is new.
 */
export default function GmailIntegrationScreen() {
  const theme = useTheme();
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
        onSuccess: (result) => {
          setScanResults((prev) => prev?.filter((r) => r.id !== item.id) ?? null);
          setAddedResult({ id: result.id, company: result.company, role: result.role, duplicate: result.duplicate });
        },
        onError: (err) => Alert.alert('Failed to save', err instanceof ApiError ? err.message : 'Please try again.'),
        onSettled: () => setAddingId(null),
      },
    );
  };

  if (gmail.isLoading) {
    return <LoadingState label="Loading Gmail integration…" />;
  }
  if (gmail.isError) {
    return <ErrorState error={gmail.error} onRetry={gmail.refetch} />;
  }

  const connected = Boolean(gmail.data?.connected);

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={gmail.isRefetching} onRefresh={gmail.refetch} tintColor={theme.tint} />}>
      <ThemedView style={styles.section}>
        <ThemedView type="backgroundElement" style={styles.statusCard}>
          <ThemedView style={styles.statusRow}>
            <ThemedView style={[styles.statusDot, { backgroundColor: connected ? theme.tint : theme.border }]} />
            <ThemedText type="smallBold" themeColor={connected ? 'tint' : 'textSecondary'}>
              {connected ? 'Connected' : 'Not connected'}
            </ThemedText>
          </ThemedView>
          <ThemedText type="small" themeColor="textSecondary">
            Scan your inbox for interview invites, offers, and rejections, and add them straight to
            your pipeline — the same Gmail integration available on the web app and browser
            extension. Only read-only access is requested and email content is never stored.
          </ThemedText>

          {connected ? (
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
              <Pressable accessibilityRole="button" onPress={() => setAddedResult(null)} style={styles.dismissButton}>
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
          <SectionHeader title={`Found ${scanResults.length} matching email${scanResults.length === 1 ? '' : 's'}`} />
          {scanResults.map((item) => (
            <ThemedView key={item.id} type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {item.subject || '(no subject)'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {item.from}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Detected: {item.parsed.company || '—'} · {item.parsed.role || '—'} · {item.parsed.status}
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
      ) : connected && !scanGmail.isPending && scanResults?.length === 0 ? (
        <ThemedView style={styles.section}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary">
              No matching emails found in the last 30 days. New interview invites, offers, or
              rejections will show up here after your next scan.
            </ThemedText>
          </ThemedView>
        </ThemedView>
      ) : null}
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
  statusCard: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
