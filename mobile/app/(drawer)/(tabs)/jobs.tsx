import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { FilterChips } from '@/components/filter-chips';
import { SearchBar } from '@/components/search-bar';
import { ErrorState } from '@/components/error-state';
import { JobCard } from '@/components/job-card';
import { LoadingState } from '@/components/loading-state';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Layout, Spacing } from '@/constants/theme';
import { useApplications } from '@/hooks/use-applications';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useJobsInfinite } from '@/hooks/use-jobs';
import { useSavedJobs } from '@/hooks/use-saved-jobs';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import type { EngineJob } from '@/types/jobs';

// GET /api/engine/jobs has no free-text search param (verified by
// reading engineJobsRoutes.js) — only `status` and `minScore`. So search
// here filters what's already been loaded into the infinite-query cache,
// client-side, rather than inventing a backend search endpoint. `status`
// is a real query param too, but every job in this database is always
// "new" in practice (nothing in the ingestion pipeline ever changes it —
// see types/jobs.ts's EngineJob.status comment), so no status filter UI
// is built: it would have exactly one option that does anything.
const MIN_SCORE_OPTIONS = [
  { label: 'All matches', value: 'all' },
  { label: '70%+', value: '70' },
  { label: '85%+', value: '85' },
] as const;

export default function JobsScreen() {
  const theme = useTheme();
  // Set by the Dashboard's search bar (components/dashboard-header.tsx),
  // which navigates here with `?q=...` rather than lifting search state
  // into a shared store — this screen already owns its own searchText,
  // this just seeds its initial value.
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [searchText, setSearchText] = useState(q ?? '');
  const [minScoreKey, setMinScoreKey] = useState<'all' | '70' | '85'>('all');
  const minScore = minScoreKey === 'all' ? undefined : Number(minScoreKey);
  const { isAdmin } = useAuth();
  const debouncedSearch = useDebouncedValue(searchText);
  const { isSaved, toggleSaved } = useSavedJobs();

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
  } = useJobsInfinite({ minScore });

  const applications = useApplications();

  // AppliedJob.engineJobId is a stringified job id (see
  // appliedJobsService.js) — build the lookup once per applications
  // refresh rather than re-scanning the list per JobCard render.
  const appliedStatusByJobId = useMemo(() => {
    const map = new Map<string, string>();
    applications.data?.forEach((item) => {
      if (item.engineJobId) map.set(item.engineJobId, item.status);
    });
    return map;
  }, [applications.data]);

  const jobs = useMemo<EngineJob[]>(() => data?.pages.flatMap((page) => page.jobs) ?? [], [data]);

  const filteredJobs = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) return jobs;

    return jobs.filter((job) => {
      const haystack = [job.title, job.companies?.name, job.location, job.job_sources?.name];
      return haystack.some((field) => field?.toLowerCase().includes(query));
    });
  }, [jobs, debouncedSearch]);

  const isFiltering = debouncedSearch.trim().length > 0 || minScore !== undefined;
  const noResultsFromFilters = isFiltering && jobs.length > 0 && filteredJobs.length === 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Jobs" subtitle="Ranked by how well they match your profile" />

        <ThemedView style={styles.controls}>
          <SearchBar value={searchText} onChangeText={setSearchText} placeholder="Search title, company, location…" />
          <FilterChips
            label="Minimum match score"
            options={MIN_SCORE_OPTIONS}
            value={minScoreKey}
            onChange={setMinScoreKey}
          />
          <ThemedView style={styles.directoryLinks}>
            <Pressable accessibilityRole="button" onPress={() => router.push('/companies')} style={styles.directoryLink}>
              <ThemedText type="smallBold" themeColor="tint">Browse companies ›</ThemedText>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/sources')} style={styles.directoryLink}>
              <ThemedText type="smallBold" themeColor="tint">{isAdmin ? 'Sources & discovery ›' : 'My sources ›'}</ThemedText>
            </Pressable>
          </ThemedView>
        </ThemedView>

        {isLoading ? (
          <LoadingState label="Loading matched jobs…" />
        ) : isError && !filteredJobs.length ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <FlatList<EngineJob>
            data={filteredJobs}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <JobCard
                item={item}
                sourceName={item.job_sources?.name ?? undefined}
                appliedStatus={appliedStatusByJobId.get(String(item.id))}
                isSaved={isSaved(item.id)}
                onToggleSaved={() => toggleSaved(item)}
              />
            )}
            ItemSeparatorComponent={() => <ThemedView style={{ height: Spacing.two }} />}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={7}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.tint} />
            }
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) fetchNextPage();
            }}
            ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={theme.tint} /> : null}
            ListEmptyComponent={
              noResultsFromFilters ? (
                <EmptyState
                  title="No jobs match"
                  subtitle="Try a different search term or a lower match threshold. More matches may also be waiting further down the list — keep scrolling."
                  actionLabel="Clear search & filters"
                  onActionPress={() => {
                    setSearchText('');
                    setMinScoreKey('all');
                  }}
                />
              ) : (
                <EmptyState
                  title="No jobs found yet"
                  subtitle="Run a discovery scrape or check back later — matched jobs will appear here."
                />
              )
            }
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, gap: Spacing.two },
  controls: { gap: 12, paddingHorizontal: Layout.gutter, paddingBottom: 4, backgroundColor: 'transparent' },
  directoryLinks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.four, backgroundColor: 'transparent' },
  directoryLink: { minHeight: 36, justifyContent: 'center' },
  listContent: { flexGrow: 1, paddingHorizontal: Layout.gutter, paddingTop: 4, paddingBottom: Spacing.six, gap: Spacing.two },
});
