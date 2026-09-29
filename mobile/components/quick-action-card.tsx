import { Pressable, StyleSheet } from 'react-native';

import { ChevronRightIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface QuickActionCardProps {
  label: string;
  onPress: () => void;
  hint?: string;
}

export function QuickActionCard({ label, onPress, hint }: QuickActionCardProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}>
      <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
        <ThemedText type="smallBold" numberOfLines={2} style={styles.label}>
          {label}
        </ThemedText>
        <ChevronRightIcon color={theme.textSecondary} size={16} />
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { flexGrow: 1, flexBasis: '47%' },
  pressed: { opacity: 0.7 },
  card: {
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  label: { flexShrink: 1 },
});
