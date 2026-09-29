import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/types/api';

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}

/** User-safe message only: ApiError messages are already sanitized; anything else is generic. */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const theme = useTheme();
  const message = error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
  const offline = error instanceof ApiError && error.isNetworkError;

  return (
    <ThemedView style={styles.container} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <ThemedText type="headline" style={styles.title}>
        {offline ? "Can't connect" : 'Something went wrong'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
        {message}
      </ThemedText>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={onRetry}
          style={[styles.retryButton, { borderColor: theme.tint }]}>
          <ThemedText type="smallBold" themeColor="tint">
            Try again
          </ThemedText>
        </Pressable>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingVertical: Spacing.six, paddingHorizontal: Spacing.four },
  title: { textAlign: 'center' },
  message: { textAlign: 'center' },
  retryButton: {
    marginTop: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
