import { router } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApplicationRow } from '@/components/application-row';
import { BarChart, type BarChartDatum } from '@/components/charts/bar-chart';
import { DonutChart } from '@/components/charts/donut-chart';
import { Card } from '@/components/card';
import { DashboardHeader } from '@/components/dashboard-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { JobCard } from '@/components/job-card';
import { LoadingState } from '@/components/loading-state';
import { QuickActionCard } from '@/components/quick-action-card';
import { SectionHeader } from '@/components/section-header';
import { StatCard } from '@/components/stat-card';
import { STATUS_COLORS } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAnalyticsSummary } from '@/hooks/use-analytics';
import { useApplications } from '@/hooks/use-applications';
import { useAuth } from '@/hooks/use-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGmailStatus } from '@/hooks/use-gmail-status';
import { useJobs } from '@/hooks/use-jobs';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function HomeScreen() {
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  const { user } = useAuth();
  const profile = useProfile();
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

  // Upcoming interviews: real tracked-job rows with an interview date
  // set, soonest first — not a fabricated feed, just a different slice
  // of the exact same ['applications'] data the rest of this screen uses.
  const upcomingInterviews = useMemo(() => {
    const now = Date.now();
    return (applications.data ?? [])
      .filter((item) => item.status === 'Interview' && item.interviewDate)
      .filter((item) => new Date(item.interviewDate as string).getTime() >= now - 1000 * 60 * 60 * 24)
      .sort((a, b) => new Date(a.interviewDate as string).getTime() - new Date(b.interviewDate as string).getTime())
      .slice(0, 3);
  }, [applications.data]);

  // Weekly application graph: real application dates bucketed into the
  // last 7 calendar days. There's no per-day time-series endpoint on the
  // backend (see app/(drawer)/(tabs)/analytics.tsx's own note on this),
  // so this is computed client-side from the already-fetched
  // ['applications'] list rather than inventing a server capability.
  const weeklyChartData = useMemo<BarChartDatum[]>(() => {
    const days: { key: string; label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - i);
      days.push({ key: date.toDateString(), label: WEEKDAY_LABELS[date.getDay()], value: 0 });
    }
    const byKey = new Map(days.map((d) => [d.key, d]));
    (applications.data ?? []).forEach((item) => {
      const key = new Date(item.appliedDate).toDateString();
      const bucket = byKey.get(key);
      if (bucket) bucket.value += 1;
    });
    return days.map((d) => ({ label: d.label, value: d.value }));
  }, [applications.data]);

  // Status distribution: a real tally of every tracked application's
  // current status, reusing the same STATUS_COLORS every other screen's
  // StatusBadge already uses, so a status means the same color here too.
  const statusDistribution = useMemo(() => {
    const counts: Record<string, number> = { Applied: 0, Interview: 0, Offer: 0, Rejected: 0 };
    (applications.data ?? []).forEach((item) => {
      if (item.status in counts) counts[item.status] += 1;
    });
    return Object.entries(counts).map(([label, value]) => ({
      label,
      value,
      color: (isDark ? STATUS_COLORS[label]?.dark : STATUS_COLORS[label]?.light)?.[1] ?? theme.tint,
    }));
  }, [applications.data, isDark, theme.tint]);

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

  const displayName = profile.data?.full_name || user?.name;

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
            <DashboardHeader name={displayName} />

            {analytics.data ? (
              <ThemedView style={styles.section}>
                <SectionHeader
                  title="Last 30 days"
                  actionLabel="View all"
                  onActionPress={() => router.navigate('/analytics')}
                />
                <ThemedView style={styles.statGrid}>
                  <StatCard label="Total Applications" value={analytics.data.totalApplications} />
                  <StatCard label="Interviews" value={analytics.data.counts.interviews} />
                  <StatCard label="Offers" value={analytics.data.counts.offers} />
                  {/* The backend doesn't return a "rejected" count field
                      directly, but its own `responses` count is defined as
                      interview + offer + rejected combined (see
                      analyticsService.js's SQL) — so subtracting the other
                      two out is exact arithmetic on real numbers, not a
                      fabricated statistic. */}
                  <StatCard
                    label="Rejections"
                    value={analytics.data.counts.responses - analytics.data.counts.interviews - analytics.data.counts.offers}
                  />
                </ThemedView>
              </ThemedView>
            ) : null}

            <ThemedView style={styles.section}>
              <SectionHeader title="Quick actions" />
              <ThemedView style={styles.quickActionGrid}>
                <QuickActionCard label="＋ Add job" onPress={() => router.push('/application/add')} />
                <QuickActionCard label="⬆ Upload resume" onPress={() => router.push('/account/edit')} />
                <QuickActionCard label="📊 Analytics" onPress={() => router.navigate('/analytics')} />
                <QuickActionCard label="⭐ Saved jobs" onPress={() => router.push('/saved-jobs')} />
              </ThemedView>
            </ThemedView>

            <ThemedView style={styles.section}>
              <SectionHeader title="Applications this week" />
              <Card variant="elevated">
                <BarChart data={weeklyChartData} />
              </Card>
            </ThemedView>

            <ThemedView style={styles.section}>
              <SectionHeader title="Status distribution" />
              <Card variant="elevated" style={styles.donutCard}>
                <DonutChart segments={statusDistribution} />
              </Card>
            </ThemedView>

            {upcomingInterviews.length > 0 ? (
              <ThemedView style={styles.section}>
                <SectionHeader
                  title="Upcoming interviews"
                  actionLabel="View all"
                  onActionPress={() => router.navigate('/applications')}
                />
                <ThemedView style={styles.recentList}>
                  {upcomingInterviews.map((item) => (
                    <ApplicationRow key={item.id} item={item} />
                  ))}
                </ThemedView>
              </ThemedView>
            ) : null}

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
    paddingTop: Spacing.two,
    paddingBottom: Spacing.six,
    gap: Spacing.five,
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
  donutCard: {
    alignItems: 'center',
  },
  syncCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
});
