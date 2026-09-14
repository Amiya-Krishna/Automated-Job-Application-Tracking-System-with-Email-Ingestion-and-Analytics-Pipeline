import { router } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApplicationRow } from '@/components/application-row';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { JobCard } from '@/components/job-card';
import { LoadingState } from '@/components/loading-state';
import { QuickActionCard } from '@/components/quick-action-card';
import { SectionHeader } from '@/components/section-header';
import { StatCard } from '@/components/stat-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAnalyticsSummary } from '@/hooks/use-analytics';
import { useApplications } from '@/hooks/use-applications';
import { useAuth } from '@/hooks/use-auth';
import { useGmailStatus } from '@/hooks/use-gmail-status';
import { useJobs } from '@/hooks/use-jobs';
import { useTheme } from '@/hooks/use-theme';

export default function HomeScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const analytics = useAnalyticsSummary();
  const applications = useApplications();
  const gmail = useGmailStatus();
  // GET /api/engine/jobs already returns page 1 ordered by best match
  // score descending (engineJobsRoutes.js sorts server-side before
  // paginating) — so the first 3 rows of the default, unfiltered query
  // ARE "top matches" already; no separate client-side sort invented.
  const topJobs = useJobs({ pageSize: 3 });

  const recentApplications = useMemo(
    () => (applications.data ?? []).slice(0, 3),
    [applications.data],
  );

  const isLoading = analytics.isLoading || applications.isLoading;
  const isError = analytics.isError || applications.isError;
  const isRefetching =
    analytics.isRefetching || applications.isRefetching || gmail.isRefetching || topJobs.isRefetching;

  const refetchAll = () => {
    analytics.refetch();
    applications.refetch();
    gmail.refetch();
    topJobs.refetch();
  };

  const firstName = user?.name?.split(' ')[0];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {isLoading ? (
          <LoadingState label="Loading your dashboard…" />
        ) : isError ? (
          <ErrorState error={analytics.error ?? applications.error} onRetry={refetchAll} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetchAll} tintColor={theme.tint} />
            }>
            <ThemedText type="title" style={styles.greeting}>
              {firstName ? `Hi, ${firstName}` : 'Welcome back'}
            </ThemedText>

            {analytics.data ? (
              <ThemedView style={styles.section}>
                <SectionHeader
                  title="Last 30 days"
                  actionLabel="View all"
                  onActionPress={() => router.navigate('/analytics')}
                />
                <ThemedView style={styles.statGrid}>
                  <StatCard label="Applications" value={analytics.data.totalApplications} />
                  <StatCard label="Interviews" value={analytics.data.counts.interviews} />
                  <StatCard label="Offers" value={analytics.data.counts.offers} />
                  {/* The backend doesn't return a "rejected" count field
                      directly, but its own `responses` count is defined as
                      interview + offer + rejected combined (see
                      analyticsService.js's SQL) — so subtracting the other
                      two out is exact arithmetic on real numbers, not a
                      fabricated statistic. */}
                  <StatCard
                    label="Rejected"
                    value={analytics.data.counts.responses - analytics.data.counts.interviews - analytics.data.counts.offers}
                  />
                </ThemedView>
              </ThemedView>
            ) : null}

            <ThemedView style={styles.section}>
              <SectionHeader title="Quick actions" />
              <ThemedView style={styles.quickActionGrid}>
                <QuickActionCard label="Add application" onPress={() => router.push('/application/add')} />
                <QuickActionCard label="View applications" onPress={() => router.navigate('/applications')} />
                <QuickActionCard label="Browse jobs" onPress={() => router.navigate('/jobs')} />
              </ThemedView>
            </ThemedView>

            <ThemedView style={styles.section}>
              <SectionHeader
                title="Top matches"
                actionLabel="View all"
                onActionPress={() => router.navigate('/jobs')}
              />
              {topJobs.data?.jobs.length ? (
                <ThemedView style={styles.recentList}>
                  {topJobs.data.jobs.slice(0, 3).map((item) => (
                    <JobCard key={item.id} item={item} />
                  ))}
                </ThemedView>
              ) : topJobs.isError ? (
                <ErrorState error={topJobs.error} onRetry={topJobs.refetch} />
              ) : !topJobs.isLoading ? (
                <EmptyState
                  title="No jobs yet"
                  subtitle="New matches will show up here once the job pipeline finds some."
                />
              ) : null}
            </ThemedView>

            <ThemedView style={styles.section}>
              <SectionHeader
                title="Recent applications"
                actionLabel="View all"
                onActionPress={() => router.navigate('/applications')}
              />
              {recentApplications.length ? (
                <ThemedView style={styles.recentList}>
                  {recentApplications.map((item) => (
                    <ApplicationRow key={item.id} item={item} />
                  ))}
                </ThemedView>
              ) : (
                <EmptyState
                  title="No applications yet"
                  subtitle="Applications you add, import from Gmail, or apply to will show up here."
                />
              )}
            </ThemedView>

            <ThemedView style={styles.section}>
              <SectionHeader
                title="Gmail sync"
                actionLabel="Manage"
                onActionPress={() => router.navigate('/profile')}
              />
              <ThemedView type="backgroundElement" style={styles.syncCard}>
                <ThemedText type="small" themeColor={gmail.data?.connected ? 'tint' : 'textSecondary'}>
                  {gmail.isLoading ? 'Checking…' : gmail.data?.connected ? 'Connected' : 'Not connected'}
                </ThemedText>
              </ThemedView>
            </ThemedView>
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
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  greeting: {
    fontSize: 28,
    lineHeight: 34,
    marginTop: Spacing.two,
  },
  section: {
    gap: Spacing.three,
    backgroundColor: 'transparent',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  quickActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  recentList: {
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  syncCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
});
