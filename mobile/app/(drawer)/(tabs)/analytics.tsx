import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { StatCard } from '@/components/stat-card';
import { STATUS_COLORS } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAnalyticsSummary, useFunnel } from '@/hooks/use-analytics';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import type { FunnelData } from '@/types/analytics';
import { formatPercent } from '@/utils/format';

// Matches client/src/pages/Analytics.jsx's <select> exactly (7/30/90) —
// GET /api/analytics genuinely supports any integer via ?range=, but
// there's no "all time" semantic to request (the SQL always filters
// `application_date >= current_date - $2::int`, so "all time" would mean
// picking an arbitrarily large number, not a real distinct backend mode)
// — sticking to the three options the web app already established.
const RANGE_OPTIONS = [7, 30, 90] as const;

// GET /api/analytics/funnel has no `range` query param at all (verified
// by reading analyticsRoutes.js — the funnel handler never reads
// req.query, and analyticsService.js's WINDOW_SQL, which does take a
// range, is only used by the summary handlers). The period selector
// below therefore only re-queries useAnalyticsSummary, not useFunnel —
// wiring it to both would silently do nothing for the funnel half.
const FUNNEL_STAGES: { key: keyof FunnelData; label: string }[] = [
  { key: 'scraped', label: 'Jobs discovered' },
  { key: 'matched', label: 'Matched to you (70%+)' },
  { key: 'applied', label: 'Applied' },
  { key: 'interview', label: 'Interviews' },
  { key: 'offer', label: 'Offers' },
];

// No trend/time-series section: neither analyticsRoutes.js nor
// analyticsService.js exposes a per-day, per-user breakdown — the only
// day-bucketed table (`analytics_daily`, behind the legacy
// GET /analytics/summary) is a genuinely system-wide rollup with no user
// dimension (see that route's own comment), not something that can be
// scoped to "this user's trend" without misrepresenting whose activity
// it shows. Per the Step 8 brief, omitting is correct here, not a gap.

function ConversionBar({ label, pct, tint, border }: { label: string; pct: string | number | null; tint: string; border: string }) {
  const value = typeof pct === 'number' ? pct : pct !== null ? parseFloat(pct) : null;
  const width = value !== null && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;

  return (
    <ThemedView style={styles.conversionRow}>
      <ThemedView style={styles.conversionLabelRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
        <ThemedText type="smallBold">{formatPercent(pct)}</ThemedText>
      </ThemedView>
      <View style={[styles.track, { backgroundColor: border }]}>
        <View style={[styles.trackFill, { width: `${width}%`, backgroundColor: tint }]} />
      </View>
    </ThemedView>
  );
}

export default function AnalyticsScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const [rangeDays, setRangeDays] = useState<number>(30);

  const summary = useAnalyticsSummary(rangeDays);
  const funnel = useFunnel();

  const hasAnyData = Boolean(summary.data) || Boolean(funnel.data);
  const isInitialLoading = !hasAnyData && (summary.isLoading || funnel.isLoading);
  const isTotalFailure = !hasAnyData && (summary.isError || funnel.isError);
  const isRefetching = summary.isRefetching || funnel.isRefetching;

  const refetchAll = () => {
    summary.refetch();
    funnel.refetch();
  };

  const counts = summary.data?.counts;
  // See app/(tabs)/index.tsx's Home screen — identical derivation and
  // reasoning: GET /api/analytics never returns a "rejected" field
  // directly, but its own `responses` count is defined server-side as
  // interview + offer + rejected combined (a tracked job's status is a
  // single current value, so these three FILTER clauses partition the
  // exact same set) — so subtracting the other two out is exact
  // arithmetic on real numbers already returned by the backend, not an
  // inferred or fabricated statistic.
  const rejected = counts ? counts.responses - counts.interviews - counts.offers : null;

  const funnelMax = funnel.data?.scraped ?? 0;

  const interviewColor = (isDark ? STATUS_COLORS.Interview.dark : STATUS_COLORS.Interview.light)[1];
  const offerColor = (isDark ? STATUS_COLORS.Offer.dark : STATUS_COLORS.Offer.light)[1];
  const rejectedColor = (isDark ? STATUS_COLORS.Rejected.dark : STATUS_COLORS.Rejected.light)[1];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Analytics" />

        {isInitialLoading ? (
          <LoadingState label="Loading your analytics…" />
        ) : isTotalFailure ? (
          <ErrorState error={summary.error ?? funnel.error} onRetry={refetchAll} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetchAll} tintColor={theme.tint} />
            }>
            <ThemedView style={styles.rangeRow}>
              {RANGE_OPTIONS.map((days) => {
                const selected = days === rangeDays;
                return (
                  <Pressable
                    key={days}
                    accessibilityRole="button"
                    onPress={() => setRangeDays(days)}
                    style={[
                      styles.rangeChip,
                      {
                        borderColor: selected ? theme.tint : theme.border,
                        backgroundColor: selected ? theme.tint : 'transparent',
                      },
                    ]}>
                    <ThemedText type="small" style={selected ? styles.rangeChipTextSelected : undefined}>
                      {`${days}d`}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ThemedView>

            <ThemedView style={styles.section}>
              <SectionHeader title={`Last ${rangeDays} days`} />
              {summary.data ? (
                <>
                  {summary.data.totalApplications === 0 ? (
                    <EmptyState
                      title="No applications in this window"
                      subtitle="Try a longer range, or start applying — matched jobs are waiting on the Jobs tab."
                      actionLabel="Browse jobs"
                      onActionPress={() => router.navigate('/jobs')}
                    />
                  ) : (
                    <ThemedView style={styles.statGrid}>
                      <StatCard label="Applications" value={summary.data.totalApplications} />
                      <StatCard label="Response rate" value={formatPercent(summary.data.responseRatePct)} />
                      <StatCard label="Interviews" value={summary.data.counts.interviews} />
                      <StatCard label="Offers" value={summary.data.counts.offers} />
                      <StatCard label="Rejected" value={rejected ?? 0} />
                    </ThemedView>
                  )}
                </>
              ) : summary.isLoading ? (
                <LoadingState label="Loading summary…" />
              ) : summary.isError ? (
                <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
              ) : null}
            </ThemedView>

            {summary.data && summary.data.totalApplications > 0 ? (
              <ThemedView style={styles.section}>
                <SectionHeader title="Conversion" />
                <ThemedView type="backgroundElement" style={styles.card}>
                  <ConversionBar
                    label="Applied → Interview"
                    pct={summary.data.conversionRate.appliedToInterviewPct}
                    tint={theme.tint}
                    border={theme.border}
                  />
                  <ConversionBar
                    label="Interview → Offer"
                    pct={summary.data.conversionRate.interviewToOfferPct}
                    tint={theme.tint}
                    border={theme.border}
                  />
                  <ConversionBar
                    label="Applied → Offer"
                    pct={summary.data.conversionRate.appliedToOfferPct}
                    tint={theme.tint}
                    border={theme.border}
                  />
                </ThemedView>
              </ThemedView>
            ) : null}

            {counts && counts.responses > 0 && rejected !== null ? (
              <ThemedView style={styles.section}>
                <SectionHeader title="Outcome breakdown" />
                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.outcomeCaption}>
                    Of {counts.responses} application{counts.responses === 1 ? '' : 's'} with an outcome
                  </ThemedText>
                  <View style={styles.segmentedBar}>
                    {counts.interviews > 0 ? (
                      <View style={{ flex: counts.interviews, backgroundColor: interviewColor }} />
                    ) : null}
                    {counts.offers > 0 ? (
                      <View style={{ flex: counts.offers, backgroundColor: offerColor }} />
                    ) : null}
                    {rejected > 0 ? <View style={{ flex: rejected, backgroundColor: rejectedColor }} /> : null}
                  </View>
                  <ThemedView style={styles.legendRow}>
                    <ThemedView style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: interviewColor }]} />
                      <ThemedText type="small" themeColor="textSecondary">
                        Interview {counts.interviews}
                      </ThemedText>
                    </ThemedView>
                    <ThemedView style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: offerColor }]} />
                      <ThemedText type="small" themeColor="textSecondary">
                        Offer {counts.offers}
                      </ThemedText>
                    </ThemedView>
                    <ThemedView style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: rejectedColor }]} />
                      <ThemedText type="small" themeColor="textSecondary">
                        Rejected {rejected}
                      </ThemedText>
                    </ThemedView>
                  </ThemedView>
                </ThemedView>
              </ThemedView>
            ) : null}

            <ThemedView style={styles.section}>
              <SectionHeader title="Funnel" />
              {funnel.data ? (
                <ThemedView type="backgroundElement" style={styles.card}>
                  {FUNNEL_STAGES.map((stage) => {
                    const value = funnel.data![stage.key];
                    const widthPct = funnelMax > 0 ? Math.max(value > 0 ? 4 : 0, (value / funnelMax) * 100) : 0;
                    return (
                      <ThemedView key={stage.key} style={styles.funnelRow}>
                        <ThemedView style={styles.conversionLabelRow}>
                          <ThemedText type="small" themeColor="textSecondary">
                            {stage.label}
                          </ThemedText>
                          <ThemedText type="smallBold">{value}</ThemedText>
                        </ThemedView>
                        <View style={[styles.track, { backgroundColor: theme.border }]}>
                          <View style={[styles.trackFill, { width: `${widthPct}%`, backgroundColor: theme.tint }]} />
                        </View>
                      </ThemedView>
                    );
                  })}
                </ThemedView>
              ) : funnel.isLoading ? (
                <LoadingState label="Loading funnel…" />
              ) : funnel.isError ? (
                <ErrorState error={funnel.error} onRetry={() => funnel.refetch()} />
              ) : null}
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
  rangeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  rangeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
    minHeight: 36,
    justifyContent: 'center',
  },
  rangeChipTextSelected: {
    color: '#ffffff',
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
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  conversionRow: {
    gap: Spacing.half,
    backgroundColor: 'transparent',
  },
  conversionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 999,
  },
  outcomeCaption: {
    marginBottom: Spacing.half,
  },
  segmentedBar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 999,
    overflow: 'hidden',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    backgroundColor: 'transparent',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    backgroundColor: 'transparent',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  funnelRow: {
    gap: Spacing.half,
    backgroundColor: 'transparent',
  },
});
