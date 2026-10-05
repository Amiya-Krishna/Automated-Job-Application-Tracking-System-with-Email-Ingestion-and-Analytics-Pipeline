import { Link, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApplicationRow } from '@/components/application-row';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Fab } from '@/components/fab';
import { FilterChips } from '@/components/filter-chips';
import { ScreenHeader } from '@/components/screen-header';
import { SearchBar } from '@/components/search-bar';
import { LoadingState } from '@/components/loading-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Layout, Spacing } from '@/constants/theme';
import { useApplications } from '@/hooks/use-applications';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTheme } from '@/hooks/use-theme';
import type { AppliedJob } from '@/types/applications';

// Mirrors client/src/pages/Dashboard.jsx's own filter/sort controls over
// the same GET /api/jobs/applied data — that endpoint has no query
// params at all (see types/applications.ts's AppliedJob comment), so
// both apps filter/sort the already-loaded list client-side, not a
// fabricated server capability.
const STATUS_FILTERS = ['All', 'Applied', 'Interview', 'Offer', 'Rejected'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
const STATUS_OPTIONS = STATUS_FILTERS.map((s) => ({ label: s, value: s }));

const SORT_OPTIONS = [
  { label: 'Newest first', value: 'newest' },
  { label: 'Oldest first', value: 'oldest' },
  { label: 'Company A–Z', value: 'company' },
] as const;
type SortValue = (typeof SORT_OPTIONS)[number]['value'];

export default function ApplicationsScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, error, refetch, isRefetching } = useApplications();

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [sort, setSort] = useState<SortValue>('newest');
  const debouncedSearch = useDebouncedValue(searchText);

  const visibleApplications = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();

    const filtered = (data ?? []).filter((item) => {
      if (statusFilter !== 'All' && item.status !== statusFilter) return false;
      if (!query) return true;
      return [item.title, item.company, item.location].some((field) =>
        field?.toLowerCase().includes(query),
      );
    });

    return [...filtered].sort((a, b) => {
      if (sort === 'company') return a.company.localeCompare(b.company);
      const dateDelta = new Date(a.appliedDate).getTime() - new Date(b.appliedDate).getTime();
      return sort === 'oldest' ? dateDelta : -dateDelta;
    });
  }, [data, debouncedSearch, statusFilter, sort]);

  const isFiltering = statusFilter !== 'All' || debouncedSearch.trim().length > 0;
  const noResultsFromFilters = isFiltering && (data?.length ?? 0) > 0 && visibleApplications.length === 0;
  const total = data?.length ?? 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title="Tracker"
          subtitle={total ? `${visibleApplications.length} of ${total} application${total === 1 ? '' : 's'}` : 'Every application in your pipeline'}
        />

        <ThemedView style={styles.controls}>
          <SearchBar value={searchText} onChangeText={setSearchText} placeholder="Search title, company, location…" />
          <FilterChips label="Filter by status" options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
          <FilterChips label="Sort applications" options={SORT_OPTIONS} value={sort} onChange={setSort} />
        </ThemedView>

        {isLoading ? (
          <LoadingState label="Loading your applications…" />
        ) : isError && !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <FlatList<AppliedJob>
            data={visibleApplications}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <ApplicationRow item={item} />}
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
            ListFooterComponent={
              total > 0 ? (
                <Link href="/engine-applications" style={styles.engineQueueLink}>
                  <ThemedText type="small" themeColor="textSecondary">
                    View the automated apply-engine&apos;s raw queue →
                  </ThemedText>
                </Link>
              ) : null
            }
            ListEmptyComponent={
              noResultsFromFilters ? (
                <EmptyState
                  title="No applications match"
                  subtitle="Try a different search or filter."
                  actionLabel="Clear search & filters"
                  onActionPress={() => {
                    setSearchText('');
                    setStatusFilter('All');
                  }}
                />
              ) : (
                <EmptyState
                  title="No applications yet"
                  subtitle="Applications you add, import from Gmail, or apply to will show up here."
                  actionLabel="Add your first application"
                  onActionPress={() => router.push('/application/add')}
                />
              )
            }
          />
        )}
      </SafeAreaView>
      <Fab label="Add" onPress={() => router.push('/application/add')} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, gap: Spacing.two },
  controls: { gap: 10, paddingHorizontal: Layout.gutter, paddingBottom: 4, backgroundColor: 'transparent' },
  engineQueueLink: { paddingVertical: Spacing.three, minHeight: 44 },
  listContent: { flexGrow: 1, paddingHorizontal: Layout.gutter, paddingTop: 4, paddingBottom: 140 },
});
