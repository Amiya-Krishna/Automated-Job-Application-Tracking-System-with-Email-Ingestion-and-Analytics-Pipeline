import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { SectionHeader } from '@/components/section-header';
import { StatCard } from '@/components/stat-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAnalyticsSummary, useFunnel } from '@/hooks/use-analytics';
import { useTheme } from '@/hooks/use-theme';
import type { FunnelData } from '@/types/analytics';
import { formatPercent } from '@/utils/format';

// A plain numeric-progression list, not a chart library — Step 5's
// instructions are explicit that a charting dependency isn't justified
// for "decorative" visualization, and nothing chart-capable is already
// installed. This still gives an honest funnel view (each stage's real
// count from the backend) without adding a dependency for it.
const FUNNEL_STAGES: { key: keyof FunnelData; label: string }[] = [
  { key: 'scraped', label: 'Jobs discovered' },
  { key: 'matched', label: 'Matched to you (70%+)' },
  { key: 'applied', label: 'Applied' },
  { key: 'interview', label: 'Interviews' },
  { key: 'offer', label: 'Offers' },
];

export default function AnalyticsScreen() {
  const theme = useTheme();
  const summary = useAnalyticsSummary();
  const funnel = useFunnel();

  const isLoading = summary.isLoading || funnel.isLoading;
  const isError = summary.isError || funnel.isError;
  const isRefetching = summary.isRefetching || funnel.isRefetching;
  const refetchAll = () => {
    summary.refetch();
    funnel.refetch();
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="title" style={styles.title}>
          Analytics
        </ThemedText>

        {isLoading ? (
          <LoadingState label="Loading your analytics…" />
        ) : isError ? (
          <ErrorState error={summary.error ?? funnel.error} onRetry={refetchAll} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetchAll} tintColor={theme.tint} />
            }>
            {summary.data ? (
              <ThemedView style={styles.section}>
                <SectionHeader title="Last 30 days" />
                <ThemedView style={styles.statGrid}>
                  <StatCard label="Applications" value={summary.data.totalApplications} />
                  <StatCard label="Response rate" value={formatPercent(summary.data.responseRatePct)} />
                  <StatCard label="Interviews" value={summary.data.counts.interviews} />
                  <StatCard label="Offers" value={summary.data.counts.offers} />
                </ThemedView>
              </ThemedView>
            ) : null}

            {funnel.data ? (
              <ThemedView style={styles.section}>
                <SectionHeader title="Funnel" />
                <ThemedView type="backgroundElement" style={styles.funnelCard}>
                  {FUNNEL_STAGES.map((stage) => (
                    <View key={stage.key} style={styles.funnelRow}>
                      <ThemedText type="small" themeColor="textSecondary">
                        {stage.label}
                      </ThemedText>
                      <ThemedText type="smallBold">{funnel.data[stage.key]}</ThemedText>
                    </View>
                  ))}
                </ThemedView>
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
    gap: Spacing.three,
    backgroundColor: 'transparent',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  funnelCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  funnelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
});
