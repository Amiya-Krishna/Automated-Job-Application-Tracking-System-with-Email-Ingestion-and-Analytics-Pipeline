import { Platform, StyleSheet, View, type ViewProps } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface CardProps extends ViewProps {
  variant?: 'flat' | 'elevated';
  padding?: keyof typeof Spacing;
}

export function Card({ variant = 'flat', padding = 'three', style, children, ...rest }: CardProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border, padding: Spacing[padding] },
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
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  elevated: Platform.select({
    ios: { shadowColor: '#101828', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.075, shadowRadius: 20 },
    android: { elevation: 5 },
    default: {},
  }),
});
