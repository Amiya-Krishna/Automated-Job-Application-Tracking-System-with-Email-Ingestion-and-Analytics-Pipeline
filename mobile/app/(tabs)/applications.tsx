import { Link, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApplicationRow } from '@/components/application-row';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
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

  const cycleSort = () => {
    const currentIndex = SORT_OPTIONS.findIndex((option) => option.value === sort);
    setSort(SORT_OPTIONS[(currentIndex + 1) % SORT_OPTIONS.length].value);
  };

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

        <Link href="/engine-applications" style={styles.engineQueueLink}>
          <ThemedText type="small" themeColor="textSecondary">
            View the automated apply-engine&apos;s raw queue →
          </ThemedText>
        </Link>

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
            {STATUS_FILTERS.map((option) => {
              const selected = option === statusFilter;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  onPress={() => setStatusFilter(option)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: selected ? theme.tint : theme.backgroundElement,
                      borderColor: theme.border,
                    },
                  ]}>
                  <ThemedText type="small" style={selected ? styles.filterChipActiveText : undefined}>
                    {option}
                  </ThemedText>
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="button"
              onPress={cycleSort}
              style={[styles.sortChip, { borderColor: theme.border }]}>
              <ThemedText type="small">
                Sort: {SORT_OPTIONS.find((option) => option.value === sort)?.label}
              </ThemedText>
            </Pressable>
          </ThemedView>
        </ThemedView>

        {isLoading ? (
          <LoadingState label="Loading your applications…" />
        ) : isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <FlatList<AppliedJob>
            data={visibleApplications}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <ApplicationRow item={item} />}
            ItemSeparatorComponent={() => <ThemedView style={{ height: Spacing.two }} />}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.tint} />
            }
            ListEmptyComponent={
              noResultsFromFilters ? (
                <EmptyState title="No applications match" subtitle="Try a different search or filter." />
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
  engineQueueLink: {
    paddingHorizontal: Spacing.four,
    minHeight: 24,
  },
  controls: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    backgroundColor: 'transparent',
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
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
    paddingVertical: Spacing.one,
    minHeight: 36,
    justifyContent: 'center',
  },
  filterChipActiveText: {
    color: '#ffffff',
  },
  sortChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    minHeight: 36,
    justifyContent: 'center',
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
});
