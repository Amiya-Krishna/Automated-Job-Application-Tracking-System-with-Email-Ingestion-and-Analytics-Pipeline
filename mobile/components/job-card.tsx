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
  /** This job's tracked application status (e.g. "Applied"), if the user has already applied — see app/(drawer)/(tabs)/jobs.tsx's appliedStatusByJobId. */
  appliedStatus?: string;
  /** Bookmark state, from hooks/use-saved-jobs.ts. Omit both to hide the bookmark control entirely (e.g. inside the Saved Jobs screen itself, where every row is already saved). */
  isSaved?: boolean;
  onToggleSaved?: () => void;
}

export function JobCard({ item, sourceName, appliedStatus, isSaved, onToggleSaved }: JobCardProps) {
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
          <ThemedView style={styles.headerActions}>
            {score !== null ? (
              <View style={[styles.scorePill, { backgroundColor: theme.tint }]}>
                <ThemedText type="small" style={styles.scoreText}>
                  {formatPercent(score)}
                </ThemedText>
              </View>
            ) : null}
            {onToggleSaved ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isSaved ? 'Remove from saved jobs' : 'Save job'}
                hitSlop={8}
                onPress={(e) => {
                  e.stopPropagation();
                  onToggleSaved();
                }}
                style={styles.bookmarkButton}>
                <ThemedText type="default" themeColor={isSaved ? 'tint' : 'textSecondary'}>
                  {isSaved ? '★' : '☆'}
                </ThemedText>
              </Pressable>
            ) : null}
          </ThemedView>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  bookmarkButton: {
    minWidth: 24,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
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
