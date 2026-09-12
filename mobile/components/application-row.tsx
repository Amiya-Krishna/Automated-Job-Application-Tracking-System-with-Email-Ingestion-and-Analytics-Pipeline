import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { AppliedJob } from '@/types/applications';
import { formatDate } from '@/utils/format';

export function ApplicationRow({ item }: { item: AppliedJob }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: '/application/[id]', params: { id: String(item.trackedJobId) } })
      }>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedView style={styles.header}>
          <ThemedView style={styles.titleBlock}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {item.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {item.company}
              {item.location ? ` · ${item.location}` : ''}
            </ThemedText>
          </ThemedView>
          <StatusBadge status={item.status} />
        </ThemedView>
        <ThemedText type="small" themeColor="textSecondary">
          Applied {formatDate(item.appliedDate)}
        </ThemedText>
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
    backgroundColor: 'transparent',
  },
  titleBlock: {
    flex: 1,
    gap: Spacing.half,
    backgroundColor: 'transparent',
  },
});
