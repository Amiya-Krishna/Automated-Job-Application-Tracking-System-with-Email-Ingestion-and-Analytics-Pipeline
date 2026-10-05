import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: ButtonVariant;
  /** `md` = 52pt primary actions; `sm` = 44pt for actions inside cards and rows (still a full touch target). */
  size?: ButtonSize;
  loading?: boolean;
  /** Stretch to the full width of the parent column (primary form / page actions). */
  fullWidth?: boolean;
  /** Fill an equal share of a row (`flex: 1`) - use for side-by-side Cancel / Save pairs. */
  grow?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, variant = 'primary', size = 'md', loading, fullWidth, grow, icon, disabled, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const filled = variant === 'primary' || variant === 'danger';
  const backgroundColor =
    variant === 'primary' ? theme.tint : variant === 'danger' ? theme.danger : variant === 'secondary' ? theme.backgroundSelected : 'transparent';
  const bordered = variant === 'secondary' || variant === 'ghost';
  const textColor = filled ? '#fff' : variant === 'secondary' ? theme.text : theme.tint;
  const minHeight = size === 'sm' ? 44 : 52;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight,
          backgroundColor,
          borderColor: bordered ? theme.border : backgroundColor,
          borderWidth: bordered ? StyleSheet.hairlineWidth * 2 : 0,
          opacity: isDisabled ? 0.55 : 1,
          paddingHorizontal: size === 'sm' ? 16 : 22,
        },
        fullWidth && styles.full,
        grow && styles.grow,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.inner}>
          {icon}
          <ThemedText type="smallBold" numberOfLines={1} style={{ color: textColor }}>
            {label}
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  full: { alignSelf: 'stretch' },
  grow: { flex: 1, alignSelf: 'stretch' },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.88 },
});
