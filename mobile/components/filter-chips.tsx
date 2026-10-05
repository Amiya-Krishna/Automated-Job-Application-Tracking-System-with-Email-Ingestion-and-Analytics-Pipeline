import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Layout, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface FilterChipsProps<T extends string> {
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group, e.g. "Filter by status". */
  label: string;
}

/**
 * One horizontally scrolling row of single-select chips. Replaces wrapping chip grids
 * (which ate three lines of screen on small phones) and keeps every chip a 40pt target.
 * Bleeds to the screen edges so the row visibly continues past the gutter.
 */
export function FilterChips<T extends string>({ options, value, onChange, label }: FilterChipsProps<T>) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={label}
      keyboardShouldPersistTaps="handled"
      style={styles.scroll}
      contentContainerStyle={styles.content}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[
              styles.chip,
              { backgroundColor: selected ? theme.tint : theme.backgroundElement, borderColor: selected ? theme.tint : theme.border },
            ]}>
            <ThemedText type="smallBold" style={{ color: selected ? '#fff' : theme.text }}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Negative margin cancels the parent's gutter so the chips can scroll edge to edge.
  scroll: { marginHorizontal: -Layout.gutter, flexGrow: 0 },
  content: { paddingHorizontal: Layout.gutter, gap: 8, alignItems: 'center' },
  chip: { minHeight: 40, paddingHorizontal: 16, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth * 2, alignItems: 'center', justifyContent: 'center' },
});
