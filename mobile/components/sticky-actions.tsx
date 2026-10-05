import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Layout } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Bottom action bar that stays visible above the keyboard / home indicator while a long form
 * scrolls. Put it as a sibling AFTER the ScrollView inside a KeyboardAvoidingView so the
 * primary action never sits at the end of a long scroll. Children are laid out in a row;
 * give each `grow` (Button) for equal widths.
 */
export function StickyActions({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: theme.background, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 12) },
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: Layout.gutter,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
});
