import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemeMode, type ThemeMode } from '@/hooks/use-theme-mode';

const OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function ThemeToggle() {
  const theme = useTheme();
  const { mode, setMode } = useThemeMode();

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundElement }]}>
      {OPTIONS.map((option) => {
        const selected = option.value === mode;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => setMode(option.value)}
            style={[styles.segment, selected && { backgroundColor: theme.tint }]}>
            <ThemedText type="smallBold" style={selected ? styles.selectedText : undefined}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: Spacing.two,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: Spacing.two - 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedText: {
    color: '#ffffff',
  },
});
