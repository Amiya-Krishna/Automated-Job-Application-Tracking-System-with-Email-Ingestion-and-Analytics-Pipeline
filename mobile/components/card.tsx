/**
 * Generic reusable card surface. Every existing screen already builds
 * its own "card" by hand with `<ThemedView type="backgroundElement">` +
 * a StyleSheet (see stat-card.tsx, quick-action-card.tsx, the account
 * screens' `.card` style, etc.) — this component is that same pattern
 * pulled out once, for the new Dashboard/Settings/Notifications UI,
 * with an optional elevated variant for the premium-shadow look the
 * dashboard cards use. Existing screens are left as-is; nothing about
 * them depends on this file.
 */
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface CardProps extends ViewProps {
  /** 'flat' matches the existing `backgroundElement` card look everywhere else. 'elevated' adds a soft shadow for hero surfaces (stat cards, chart cards). */
  variant?: 'flat' | 'elevated';
  padding?: keyof typeof Spacing;
}

export function Card({ variant = 'flat', padding = 'three', style, children, ...rest }: CardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: theme.backgroundElement, padding: Spacing[padding] },
        variant === 'elevated' && styles.elevated,
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Spacing.three,
  },
  elevated: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
    },
    android: {
      elevation: 3,
    },
    default: {},
  }),
});
