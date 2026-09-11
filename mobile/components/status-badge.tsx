import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Mirrors client/src/pages/AppliedJobs.jsx's STATUS_STYLES exactly, so a
// status means the same color on web and mobile. Light/dark pairs taken
// directly from those Tailwind classes (amber-100/800, amber-950/300, etc).
const STATUS_COLORS: Record<string, { light: [string, string]; dark: [string, string] }> = {
  Applied: { light: ['#fef3c7', '#92400e'], dark: ['#451a03', '#fcd34d'] },
  Interview: { light: ['#dbeafe', '#1e40af'], dark: ['#172554', '#93c5fd'] },
  Offer: { light: ['#d1fae5', '#065f46'], dark: ['#022c22', '#6ee7b7'] },
  Rejected: { light: ['#ffe4e6', '#9f1239'], dark: ['#4c0519', '#fda4af'] },
};

export function StatusBadge({ status }: { status: string }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.Applied;
  const [background, text] = isDark ? colors.dark : colors.light;

  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <ThemedText type="small" style={[styles.text, { color: text }]}>
        {status}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
});
