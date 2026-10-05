import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { CloseIcon, SearchIcon } from '@/components/icons';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface SearchBarProps extends Omit<TextInputProps, 'style'> {
  onSubmit?: () => void;
}

/** Rounded search field with a leading magnifier and a clear button once there is text. */
export function SearchBar({ onSubmit, value, onChangeText, ...rest }: SearchBarProps) {
  const theme = useTheme();
  const hasText = typeof value === 'string' && value.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <SearchIcon color={theme.textSecondary} size={20} />
      <TextInput
        accessibilityLabel={rest.placeholder ?? 'Search'}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        value={value}
        onChangeText={onChangeText}
        style={[styles.input, { color: theme.text }]}
        {...rest}
      />
      {hasText ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={10}
          onPress={() => onChangeText?.('')}
          style={styles.clear}>
          <CloseIcon color={theme.textSecondary} size={16} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 12 },
  clear: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});
