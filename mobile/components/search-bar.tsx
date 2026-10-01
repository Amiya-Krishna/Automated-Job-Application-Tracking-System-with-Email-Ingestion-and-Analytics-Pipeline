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
      <View style={styles.searchGlyph}><TextInput
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        style={[styles.input, { color: theme.text }]}
        {...rest}
      /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchGlyph: { flex:1, justifyContent:'center', paddingLeft:22 },
  container: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 15,
    justifyContent: 'center',
    minHeight: 54,
  },
  input: {
    fontSize: 16,
    padding: 0,
  },
});
