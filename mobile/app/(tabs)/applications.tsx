import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApplicationRow } from '@/components/application-row';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useApplications } from '@/hooks/use-applications';
import { useTheme } from '@/hooks/use-theme';
import type { AppliedJob } from '@/types/applications';

export default function ApplicationsScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, error, refetch, isRefetching } = useApplications();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedView style={styles.titleRow}>
          <ThemedText type="title" style={styles.title}>
            Applications
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/application/add')}
            hitSlop={Spacing.two}
            style={styles.addButton}>
            <ThemedText type="smallBold" themeColor="tint">
              + Add
            </ThemedText>
          </Pressable>
        </ThemedView>

        {isLoading ? (
          <LoadingState label="Loading your applications…" />
        ) : isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <FlatList<AppliedJob>
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <ApplicationRow item={item} />}
            ItemSeparatorComponent={() => <ThemedView style={{ height: Spacing.two }} />}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.tint} />
            }
            ListEmptyComponent={
              <EmptyState
                title="No applications yet"
                subtitle="Applications you add, import from Gmail, or apply to will show up here."
                actionLabel="Add your first application"
                onActionPress={() => router.push('/application/add')}
              />
            }
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    gap: Spacing.three,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  addButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
});
