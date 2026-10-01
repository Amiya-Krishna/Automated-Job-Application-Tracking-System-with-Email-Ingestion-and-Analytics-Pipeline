import { Pressable, StyleSheet, View } from 'react-native';

import { ChevronRightIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface QuickActionCardProps {
  label: string;
  onPress: () => void;
  hint?: string;
  icon?: string;
  tone?: 'purple' | 'blue' | 'pink' | 'green' | 'orange';
}

const tones = {
  purple: ['#7C3AED', '#EDE9FE'],
  blue: ['#2563EB', '#DBEAFE'],
  pink: ['#DB2777', '#FCE7F3'],
  green: ['#059669', '#D1FAE5'],
  orange: ['#EA580C', '#FFEDD5'],
} as const;

export function QuickActionCard({ label, onPress, hint, icon = '✦', tone = 'purple' }: QuickActionCardProps) {
  const theme = useTheme();
  const [accent, soft] = tones[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}>
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={[styles.icon, { backgroundColor: soft }]}>
          <ThemedText style={[styles.iconText, { color: accent }]}>{icon}</ThemedText>
        </View>
        <View style={styles.copy}>
          <ThemedText type="smallBold" numberOfLines={2}>{label}</ThemedText>
          {hint ? <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>{hint}</ThemedText> : null}
        </View>
        <ChevronRightIcon color={theme.textSecondary} size={16} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { flexGrow: 1, flexBasis: '47%' },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    minHeight: 108,
    justifyContent: 'space-between',
    gap: 10,
  },
  icon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 19, lineHeight: 22, fontWeight: '800' },
  copy: { flex: 1, gap: 2 },
});
