import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { JobCard } from '@/components/job-card';
import { LoadingState } from '@/components/loading-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useApplications } from '@/hooks/use-applications';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useJobsInfinite } from '@/hooks/use-jobs';
import { useSourceNameById } from '@/hooks/use-sources';
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
const MIN_SCORE_OPTIONS: { label: string; value: number | undefined }[] = [
  { label: 'All matches', value: undefined },
  { label: '70%+', value: 70 },
  { label: '85%+', value: 85 },
];

export default function JobsScreen() {
  const theme = useTheme();
  const [searchText, setSearchText] = useState('');
  const [minScore, setMinScore] = useState<number | undefined>(undefined);
  const debouncedSearch = useDebouncedValue(searchText);

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

  const sourceNameById = useSourceNameById();
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
      const sourceName = job.source_id ? sourceNameById.get(job.source_id) : undefined;
      const haystack = [job.title, job.companies?.name, job.location, sourceName];
      return haystack.some((field) => field?.toLowerCase().includes(query));
    });
  }, [jobs, debouncedSearch, sourceNameById]);

  const isFiltering = debouncedSearch.trim().length > 0 || minScore !== undefined;
  const noResultsFromFilters = isFiltering && jobs.length > 0 && filteredJobs.length === 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="title" style={styles.title}>
          Jobs
        </ThemedText>

        <ThemedView style={styles.directoryLinks}>
          <Link href="/companies" asChild>
            <Pressable accessibilityRole="button" style={styles.directoryLink}>
              <ThemedText type="small" themeColor="tint">
                Companies
              </ThemedText>
            </Pressable>
          </Link>
          <Link href="/sources" asChild>
            <Pressable accessibilityRole="button" style={styles.directoryLink}>
              <ThemedText type="small" themeColor="tint">
                Sources
              </ThemedText>
            </Pressable>
          </Link>
        </ThemedView>

        <ThemedView style={styles.controls}>
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search title, company, location…"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={[
              styles.searchInput,
              { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
          />

          <ThemedView style={styles.filterRow}>
            {MIN_SCORE_OPTIONS.map((option) => {
              const selected = option.value === minScore;
              return (
                <Pressable
                  key={option.label}
                  accessibilityRole="button"
                  onPress={() => setMinScore(option.value)}
                  style={[
                    styles.filterChip,
                    {
                      borderColor: selected ? theme.tint : theme.border,
                      backgroundColor: selected ? theme.tint : 'transparent',
                    },
                  ]}>
                  <ThemedText type="small" style={selected ? styles.filterChipTextSelected : undefined}>
                    {option.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ThemedView>
        </ThemedView>

        {isLoading ? (
          <LoadingState label="Loading matched jobs…" />
        ) : isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <FlatList<EngineJob>
            data={filteredJobs}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <JobCard
                item={item}
                sourceName={item.source_id ? sourceNameById.get(item.source_id) : undefined}
                appliedStatus={appliedStatusByJobId.get(String(item.id))}
              />
            )}
            ItemSeparatorComponent={() => <ThemedView style={{ height: Spacing.two }} />}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
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
                    setMinScore(undefined);
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
  directoryLinks: {
    flexDirection: 'row',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    backgroundColor: 'transparent',
  },
  directoryLink: {
    minHeight: 32,
    justifyContent: 'center',
  },
  controls: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    backgroundColor: 'transparent',
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    minHeight: 44,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
    minHeight: 36,
    justifyContent: 'center',
  },
  filterChipTextSelected: {
    color: '#ffffff',
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
  },
});
