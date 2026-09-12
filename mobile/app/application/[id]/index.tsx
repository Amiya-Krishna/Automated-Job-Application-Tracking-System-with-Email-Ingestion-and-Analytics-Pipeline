import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  useApplication,
  useEngineApplicationForJob,
  useRecordEngineOutcome,
  useSubmitEngineApplication,
} from '@/hooks/use-applications';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/types/api';
import { OUTCOME_STATUSES, type OutcomeStatus } from '@/types/applications';
import { formatDate, formatPercent } from '@/utils/format';

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <ThemedView style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="default">{value}</ThemedText>
    </ThemedView>
  );
}

export default function ApplicationDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const trackedJobId = Number(id);

  const { application, isLoading, isError, error, refetch } = useApplication(trackedJobId);
  // AppliedJob.engineJobId is a stringified BigInt (see appliedJobsService.js);
  // EngineApplication.job_id is a plain number — convert once, here.
  const engineJobId = application?.engineJobId ? Number(application.engineJobId) : null;
  const engineApplication = useEngineApplicationForJob(engineJobId);

  const submitMutation = useSubmitEngineApplication();
  const outcomeMutation = useRecordEngineOutcome();
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading || application === undefined) {
    return <LoadingState label="Loading application…" />;
  }
  if (isError) {
    return <ErrorState error={error} onRetry={refetch} />;
  }
  if (application === null) {
    return (
      <ThemedView style={styles.notFoundContainer}>
        <ThemedText type="smallBold">Application not found</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.notFoundSubtitle}>
          It may have been removed, or this link is out of date.
        </ThemedText>
      </ThemedView>
    );
  }

  const runSubmit = () => {
    const applicationId = engineApplication.data?.id;
    if (!applicationId) return;

    Alert.alert('Mark this application as submitted?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: () => {
          setActionError(null);
          submitMutation.mutate(applicationId, {
            onError: (err) =>
              setActionError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'),
          });
        },
      },
    ]);
  };

  const runOutcome = (status: OutcomeStatus) => {
    const applicationId = engineApplication.data?.id;
    if (!applicationId) return;

    Alert.alert(`Mark this application as ${status}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        style: status === 'rejected' ? 'destructive' : 'default',
        onPress: () => {
          setActionError(null);
          outcomeMutation.mutate(
            { applicationId, status },
            {
              onError: (err) =>
                setActionError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'),
            },
          );
        },
      },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedView style={styles.header}>
            <ThemedView style={styles.titleBlock}>
              <ThemedText type="default" style={styles.jobTitle}>
                {application.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {application.company}
                {application.location ? ` · ${application.location}` : ''}
              </ThemedText>
            </ThemedView>
            <StatusBadge status={application.status} />
          </ThemedView>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: '/application/[id]/edit', params: { id: String(trackedJobId) } })
            }
            style={[styles.editButton, { borderColor: theme.tint }]}>
            <ThemedText type="smallBold" themeColor="tint">
              Edit
            </ThemedText>
          </Pressable>

          <ThemedView style={styles.fieldGroup}>
            <Field label="Applied" value={formatDate(application.appliedDate)} />
            <Field label="Source" value={application.source} />
            <Field label="Interview date" value={application.interviewDate} />
            {application.matchScore !== null ? (
              <Field label="Match score" value={formatPercent(application.matchScore)} />
            ) : null}
            <Field label="Notes" value={application.notes} />
          </ThemedView>

          {application.sourceUrl ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => WebBrowser.openBrowserAsync(application.sourceUrl as string)}
              style={styles.linkRow}>
              <ThemedText type="linkPrimary">View job posting ↗</ThemedText>
            </Pressable>
          ) : null}

          {engineJobId !== null ? (
            <ThemedView type="backgroundElement" style={styles.engineSection}>
              <ThemedText type="smallBold">Automation status</ThemedText>
              {engineApplication.isLoading ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Checking…
                </ThemedText>
              ) : engineApplication.data ? (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    {engineApplication.data.status}
                  </ThemedText>
                  {actionError ? (
                    <ThemedText type="small" themeColor="danger">
                      {actionError}
                    </ThemedText>
                  ) : null}
                  <ThemedView style={styles.actionRow}>
                    {engineApplication.data.status === 'pending' ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={submitMutation.isPending}
                        onPress={runSubmit}
                        style={[
                          styles.actionButton,
                          { borderColor: theme.tint, opacity: submitMutation.isPending ? 0.5 : 1 },
                        ]}>
                        <ThemedText type="smallBold" themeColor="tint">
                          {submitMutation.isPending ? 'Submitting…' : 'Submit'}
                        </ThemedText>
                      </Pressable>
                    ) : null}
                    {OUTCOME_STATUSES.map((status) => (
                      <Pressable
                        key={status}
                        accessibilityRole="button"
                        disabled={outcomeMutation.isPending}
                        onPress={() => runOutcome(status)}
                        style={[
                          styles.actionButton,
                          {
                            borderColor: status === 'rejected' ? theme.danger : theme.tint,
                            opacity: outcomeMutation.isPending ? 0.5 : 1,
                          },
                        ]}>
                        <ThemedText type="smallBold" themeColor={status === 'rejected' ? 'danger' : 'tint'}>
                          Mark {status}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </ThemedView>
                </>
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  Not currently in the automated apply queue.
                </ThemedText>
              )}
            </ThemedView>
          ) : null}
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
    gap: Spacing.four,
  },
  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    padding: Spacing.four,
  },
  notFoundSubtitle: {
    textAlign: 'center',
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
  editButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
  },
  fieldGroup: {
    gap: Spacing.three,
    backgroundColor: 'transparent',
  },
  field: {
    gap: Spacing.half,
    backgroundColor: 'transparent',
  },
  linkRow: {
    minHeight: 44,
    justifyContent: 'center',
  },
  engineSection: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  actionButton: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
