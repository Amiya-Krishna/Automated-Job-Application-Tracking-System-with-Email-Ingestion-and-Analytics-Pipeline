import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useApplications, useApplyToEngineJob } from '@/hooks/use-applications';
import { useJob } from '@/hooks/use-jobs';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/types/api';
import { formatPercent } from '@/utils/format';

export default function JobDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = Number(id);

  const { data: job, isLoading, isError, error, refetch } = useJob(jobId);
  const applications = useApplications();
  const applyMutation = useApplyToEngineJob();
  const [applyError, setApplyError] = useState<string | null>(null);

  // Cross-references the already-fetched applications list to avoid
  // re-queuing a job the user already applied to from this screen —
  // POST /:jobId is idempotent server-side either way (see applyRoutes.js),
  // this is purely a UX improvement, not a safety requirement.
  const alreadyTracked = useMemo(
    () => applications.data?.find((item) => item.engineJobId === String(jobId)) ?? null,
    [applications.data, jobId],
  );

  if (isLoading) {
    return <LoadingState label="Loading job…" />;
  }
  if (isError) {
    return <ErrorState error={error} onRetry={refetch} />;
  }
  if (!job) {
    return (
      <ThemedView style={styles.notFoundContainer}>
        <ThemedText type="smallBold">Job not found</ThemedText>
      </ThemedView>
    );
  }

  const score = job.match_scores[0]?.score ?? null;

  const runApply = () => {
    setApplyError(null);
    applyMutation.mutate(jobId, {
      onSuccess: (result) => {
        if (result.trackedJobId) {
          router.replace({ pathname: '/application/[id]', params: { id: String(result.trackedJobId) } });
        } else {
          // Extremely unlikely per applyRoutes.js (it always creates or
          // updates a TrackedJob before responding), but handled rather
          // than assumed away — see POST /:jobId's `trackedJobId: trackedJob?.id ?? null`.
          Alert.alert('Application queued', 'Check the Applications tab shortly.');
          router.back();
        }
      },
      onError: (err) => setApplyError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'),
    });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedView style={styles.header}>
            <ThemedView style={styles.titleBlock}>
              <ThemedText type="default" style={styles.jobTitle}>
                {job.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {job.companies?.name ?? 'Unknown company'}
                {job.location ? ` · ${job.location}` : ''}
              </ThemedText>
            </ThemedView>
            {score !== null ? (
              <ThemedView style={[styles.scorePill, { backgroundColor: theme.tint }]}>
                <ThemedText type="small" style={styles.scoreText}>
                  {formatPercent(score)}
                </ThemedText>
              </ThemedView>
            ) : null}
          </ThemedView>

          {job.remote_type ? (
            <ThemedText type="small" themeColor="textSecondary">
              {job.remote_type}
            </ThemedText>
          ) : null}

          {applyError ? (
            <ThemedView style={[styles.errorBanner, { borderColor: theme.danger }]}>
              <ThemedText type="small" themeColor="danger">
                {applyError}
              </ThemedText>
            </ThemedView>
          ) : null}

          {alreadyTracked ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/application/[id]',
                  params: { id: String(alreadyTracked.trackedJobId) },
                })
              }
              style={[styles.primaryButton, { backgroundColor: theme.tint }]}>
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                View your application
              </ThemedText>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={applyMutation.isPending}
              onPress={runApply}
              style={[styles.primaryButton, { backgroundColor: theme.tint, opacity: applyMutation.isPending ? 0.7 : 1 }]}>
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                {applyMutation.isPending ? 'Applying…' : 'Apply'}
              </ThemedText>
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => WebBrowser.openBrowserAsync(job.source_url)}
            style={styles.linkRow}>
            <ThemedText type="linkPrimary">View original posting ↗</ThemedText>
          </Pressable>

          <ThemedView style={styles.descriptionBlock}>
            <ThemedText type="smallBold">Description</ThemedText>
            <ThemedText type="default">{job.description}</ThemedText>
          </ThemedView>
        </ScrollView>
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
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  titleBlock: {
    flex: 1,
    gap: Spacing.half,
    backgroundColor: 'transparent',
  },
  jobTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  scorePill: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  scoreText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
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
  linkRow: {
    minHeight: 44,
    justifyContent: 'center',
  },
  descriptionBlock: {
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
});
