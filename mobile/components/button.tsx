import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
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
  const filled = variant === 'primary' || variant === 'danger';
  const backgroundColor = variant === 'primary' ? theme.tint : variant === 'danger' ? theme.danger : variant === 'secondary' ? theme.backgroundSelected : 'transparent';
  const borderColor = variant === 'secondary' || variant === 'ghost' ? theme.border : backgroundColor;
  const textColor = filled ? '#fff' : variant === 'secondary' ? theme.text : theme.tint;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor, borderColor, borderWidth: variant === 'secondary' || variant === 'ghost' ? 1 : 0, opacity: isDisabled ? 0.55 : pressed ? 0.82 : 1, alignSelf: fullWidth ? 'stretch' : 'flex-start' },
      ]}
      {...rest}>
      {loading ? <ActivityIndicator color={textColor} /> : <ThemedText type="smallBold" style={{ color: textColor }}>{label}</ThemedText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 50, borderRadius: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
});
