import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCompaniesInfinite } from '@/hooks/use-companies';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTheme } from '@/hooks/use-theme';
import type { Company } from '@/types/companies';

export default function CompaniesScreen() {
  const theme = useTheme();
  const [searchText, setSearchText] = useState('');
  // Unlike Jobs' client-side search (no backend param — see
  // app/(tabs)/jobs.tsx), GET /api/companies DOES support a real
  // `search` query param (companiesRoutes.js), so this debounces the
  // network request itself rather than an in-memory filter.
  const debouncedSearch = useDebouncedValue(searchText, 250);

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
  } = useCompaniesInfinite({ search: debouncedSearch || undefined });

  const companies = useMemo<Company[]>(() => data?.pages.flatMap((page) => page.companies) ?? [], [data]);
  const total = data?.pages[0]?.meta.total ?? 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="title" style={styles.title}>
          Companies
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          Employers deduplicated by the ingestion pipeline, and how many of their jobs have been
          scraped so far.
        </ThemedText>

        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search by name or domain…"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[
            styles.searchInput,
            { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}
        />

        {isLoading ? (
          <LoadingState label="Loading companies…" />
        ) : isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <FlatList<Company>
            data={companies}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/companies/[id]', params: { id: String(item.id) } })}>
                <ThemedView type="backgroundElement" style={styles.row}>
                  <ThemedView style={styles.rowText}>
                    <ThemedText type="smallBold" numberOfLines={1}>
                      {item.name}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {item.domain ?? 'No domain on file'}
                    </ThemedText>
                  </ThemedView>
                  <ThemedView style={[styles.countPill, { backgroundColor: theme.tint }]}>
                    <ThemedText type="small" style={styles.countText}>
                      {item.jobCount}
                    </ThemedText>
                  </ThemedView>
                </ThemedView>
              </Pressable>
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
            ListHeaderComponent={
              companies.length > 0 ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.countLabel}>
                  Showing {companies.length} of {total} companies
                </ThemedText>
              ) : null
            }
            ListEmptyComponent={
              <EmptyState
                title={debouncedSearch ? 'No companies match' : 'No companies yet'}
                subtitle={
                  debouncedSearch
                    ? 'Try a different search term.'
                    : "They'll appear here once the scraper has ingested some jobs."
                }
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
  subtitle: {
    paddingHorizontal: Spacing.four,
  },
  searchInput: {
    marginHorizontal: Spacing.four,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 44,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  countLabel: {
    marginBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    minHeight: 44,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
    backgroundColor: 'transparent',
  },
  countPill: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  countText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
});
