import { useMemo } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { JobCard } from '@/components/job-card';
import { LoadingState } from '@/components/loading-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useJobsInfinite } from '@/hooks/use-jobs';
import { useTheme } from '@/hooks/use-theme';
import type { EngineJob } from '@/types/jobs';

export default function JobsScreen() {
  const theme = useTheme();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useJobsInfinite();

  const jobs = useMemo<EngineJob[]>(() => data?.pages.flatMap((page) => page.jobs) ?? [], [data]);

  // Filtering/search UI is intentionally not built yet — the backend
  // supports `status` and `minScore` query params (engineJobsRoutes.js)
  // but no free-text search, and this step is scoped to the screen
  // shell/architecture, not full filter logic (see Step 5 instructions:
  // "do not implement complex filtering logic unless the existing
  // backend supports it" — status/minScore are real params, a search
  // box wired to nothing would not be).

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="title" style={styles.title}>
          Jobs
        </ThemedText>

        {isLoading ? (
          <LoadingState label="Loading matched jobs…" />
        ) : isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <FlatList<EngineJob>
            data={jobs}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => <JobCard item={item} />}
            ItemSeparatorComponent={() => <ThemedView style={{ height: Spacing.two }} />}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.tint} />
            }
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) fetchNextPage();
            }}
            ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={theme.tint} /> : null}
            ListEmptyComponent={
              <EmptyState
                title="No jobs found yet"
                subtitle="Run a discovery scrape or check back later — matched jobs will appear here."
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
  title: {
    fontSize: 28,
    lineHeight: 34,
    paddingHorizontal: Spacing.four,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
  },
});
