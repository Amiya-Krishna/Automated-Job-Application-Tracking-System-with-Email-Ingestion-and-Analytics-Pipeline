import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { EngineJob } from '@/types/jobs';
import { formatPercent } from '@/utils/format';

interface JobCardProps {
  item: EngineJob;
  /** Display name for item.source_id, if resolved via useSourceNameById(). */
  sourceName?: string;
  /** This job's tracked application status (e.g. "Applied"), if the user has already applied — see app/(tabs)/jobs.tsx's appliedStatusByJobId. */
  appliedStatus?: string;
}

export function JobCard({ item, sourceName, appliedStatus }: JobCardProps) {
  const theme = useTheme();
  const score = item.match_scores[0]?.score ?? null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/job/[id]', params: { id: String(item.id) } })}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.header}>
          <ThemedView style={styles.titleBlock}>
            <ThemedText type="smallBold" numberOfLines={2}>
              {item.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {item.companies?.name ?? 'Unknown company'}
              {item.location ? ` · ${item.location}` : ''}
            </ThemedText>
          </ThemedView>
          {score !== null ? (
            <View style={[styles.scorePill, { backgroundColor: theme.tint }]}>
              <ThemedText type="small" style={styles.scoreText}>
                {formatPercent(score)}
              </ThemedText>
            </View>
          ) : null}
        </View>

        {item.remote_type || sourceName ? (
          <ThemedText type="small" themeColor="textSecondary">
            {[item.remote_type, sourceName].filter(Boolean).join(' · ')}
          </ThemedText>
        ) : null}

        {appliedStatus ? (
          <View style={styles.appliedRow}>
            <StatusBadge status={appliedStatus} />
          </View>
        ) : null}
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    minHeight: 44,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  titleBlock: {
    flex: 1,
    gap: Spacing.half,
    backgroundColor: 'transparent',
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
  appliedRow: {
    flexDirection: 'row',
  },
});
