import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';

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
        { backgroundColor, borderColor, borderWidth: variant === 'secondary' || variant === 'ghost' ? 1 : 0, opacity: isDisabled ? 0.55 : 1, alignSelf: fullWidth ? 'stretch' : 'flex-start' },
        pressed && !isDisabled && styles.pressed,
      ]}
      {...rest}>
      {loading ? <ActivityIndicator color={textColor} /> : <View style={styles.inner}><ThemedText type="smallBold" style={{ color: textColor }}>{label}</ThemedText></View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 54, borderRadius: 17, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', ...({ shadowColor:'#101828', shadowOffset:{width:0,height:6}, shadowOpacity:0.10, shadowRadius:12 } as object) },
  inner: { minHeight: 54, alignItems:'center', justifyContent:'center' },
  pressed: { transform:[{scale:0.985}], opacity:0.88 },
});
