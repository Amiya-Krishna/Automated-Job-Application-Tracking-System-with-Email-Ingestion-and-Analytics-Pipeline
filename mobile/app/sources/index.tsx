import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSources } from '@/hooks/use-sources';
import { useTheme } from '@/hooks/use-theme';

export default function SourcesScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, error, refetch, isRefetching } = useSources();

  const maxJobs = useMemo(() => Math.max(1, ...(data ?? []).map((s) => s.jobCount || 0)), [data]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {isLoading ? (
          <LoadingState label="Loading sources…" />
        ) : isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.tint} />
            }>
            <ThemedText type="title" style={styles.title}>
              Job sources
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Where the scraper pulls listings from, and how many jobs each one has contributed.
            </ThemedText>

            {!data || data.length === 0 ? (
              <EmptyState
                title="No sources yet"
                subtitle="Sources appear here as soon as the scraper ingests its first job."
              />
            ) : (
              <ThemedView style={styles.list}>
                {data.map((source) => (
                  <Pressable
                    key={source.id}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({ pathname: '/sources/[id]', params: { id: String(source.id) } })
                    }
                    style={styles.row}>
                    <ThemedView style={styles.rowHeader}>
                      <ThemedText type="smallBold" style={styles.sourceName}>
                        {source.name}
                      </ThemedText>
                      <ThemedView style={[styles.countPill, { backgroundColor: theme.backgroundElement }]}>
                        <ThemedText type="small">{source.jobCount} jobs</ThemedText>
                      </ThemedView>
                    </ThemedView>
                    <View style={[styles.barTrack, { backgroundColor: theme.backgroundElement }]}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            backgroundColor: theme.tint,
                            width: `${((source.jobCount || 0) / maxJobs) * 100}%`,
                          },
                        ]}
                      />
                    </View>
                  </Pressable>
                ))}
              </ThemedView>
            )}
          </ScrollView>
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
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    marginTop: Spacing.two,
  },
  list: {
    gap: Spacing.four,
    marginTop: Spacing.two,
    backgroundColor: 'transparent',
  },
  row: {
    gap: Spacing.two,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  sourceName: {
    textTransform: 'capitalize',
  },
  countPill: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  barTrack: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
  },
});
