import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface FormTextInputProps extends TextInputProps {
  label: string;
  error?: string;
}

export function FormTextInput({ label, error, style, ...rest }: FormTextInputProps) {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        style={[
          styles.input,
          {
            color: theme.text,
            borderColor: error ? theme.danger : theme.border,
            backgroundColor: theme.backgroundElement,
          },
          style,
        ]}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        {...rest}
      />
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.half,
    backgroundColor: 'transparent',
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    minHeight: 48, // accessible touch target
  },
});
