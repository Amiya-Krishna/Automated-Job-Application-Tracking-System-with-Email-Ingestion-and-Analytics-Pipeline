import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

interface StatCardProps {
  label: string;
  value: string | number;
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <ThemedView type="backgroundElement" style={styles.card} accessible accessibilityLabel={`${label}: ${value}`}>
      <ThemedText type="display" style={styles.value} importantForAccessibility="no">
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" importantForAccessibility="no">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { flexBasis: '47%', flexGrow: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.half },
  value: { fontSize: 30, lineHeight: 36 },
});
