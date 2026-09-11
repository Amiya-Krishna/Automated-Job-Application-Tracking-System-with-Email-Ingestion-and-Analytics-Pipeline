import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { EngineJob } from '@/types/jobs';
import { formatPercent } from '@/utils/format';

export function JobCard({ item }: { item: EngineJob }) {
  const theme = useTheme();
  const score = item.match_scores[0]?.score ?? null;

  return (
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
      {item.remote_type ? (
        <ThemedText type="small" themeColor="textSecondary">
          {item.remote_type}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
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
});
