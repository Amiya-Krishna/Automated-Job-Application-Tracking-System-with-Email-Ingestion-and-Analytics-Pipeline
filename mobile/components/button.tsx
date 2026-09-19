/**
 * Reusable button primitive. Existing screens hand-roll primary/secondary
 * buttons with their own StyleSheet (see app/(drawer)/(tabs)/profile.tsx's
 * `.primaryButton`/`.secondaryButton`, app/account/settings.tsx's
 * `.logoutButton`) — those are left untouched, but every new screen
 * built for this redesign (Dashboard quick actions, Settings, the
 * drawer's static screens) uses this instead of re-deriving the same
 * styles a fourth or fifth time.
 */
import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({ label, variant = 'primary', loading, fullWidth, disabled, ...rest }: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const backgroundColor =
    variant === 'primary' ? theme.tint : variant === 'danger' ? theme.danger : 'transparent';
  const borderColor = variant === 'secondary' || variant === 'ghost' ? theme.border : 'transparent';
  const textColor =
    variant === 'primary' || variant === 'danger' ? '#ffffff' : variant === 'secondary' ? theme.text : theme.tint;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={[
        styles.base,
        {
          backgroundColor,
          borderColor,
          borderWidth: variant === 'secondary' || variant === 'ghost' ? 1 : 0,
          opacity: isDisabled ? 0.6 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <ThemedText type="smallBold" style={{ color: textColor }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
