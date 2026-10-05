import { Platform, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlusIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Layout } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface FabProps {
  label: string;
  onPress: () => void;
}

/**
 * Floating primary action, bottom-right in the thumb zone. Extended (icon + label) so the
 * action is named, not guessed. `bottomOffset` clears the native tab bar.
 */
export function Fab({ label, onPress }: FabProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: theme.tint, bottom: Math.max(insets.bottom, 12) + Layout.tabBarClearance, right: Layout.gutter },
        pressed && styles.pressed,
      ]}>
      <PlusIcon color="#fff" size={20} />
      <ThemedText type="smallBold" style={styles.label}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    minHeight: 52,
    paddingHorizontal: 20,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#101828', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 14 },
      android: { elevation: 8 },
      default: {},
    }),
  },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  label: { color: '#fff' },
});
