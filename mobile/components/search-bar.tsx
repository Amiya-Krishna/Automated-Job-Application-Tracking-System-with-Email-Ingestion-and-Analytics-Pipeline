import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface SearchBarProps extends Omit<TextInputProps, 'style'> {
  onSubmit?: () => void;
}

export function SearchBar({ onSubmit, ...rest }: SearchBarProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        style={[styles.input, { color: theme.text }]}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    minHeight: 48,
  },
  input: {
    fontSize: 16,
    padding: 0,
  },
});
