import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

interface QuickActionCardProps {
  label: string;
  onPress: () => void;
}

export function QuickActionCard({ label, onPress }: QuickActionCardProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.pressable}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{label}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flexGrow: 1,
    flexBasis: '47%',
  },
  card: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
    justifyContent: 'center',
  },
});
