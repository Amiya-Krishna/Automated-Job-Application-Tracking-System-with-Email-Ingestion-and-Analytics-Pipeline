import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSourceDetail } from '@/hooks/use-sources';
import type { JobSourceDetailJob, JobSourceDetailTrackedJob } from '@/types/sources';
import { formatDate } from '@/utils/format';

// Discriminate the two row shapes with a runtime check rather than a
// `kind` field the backend doesn't send — see types/sources.ts's
// JobSourceDetail comment for why exactly one of jobs/trackedJobs comes
// back, never both.
function isEngineJobRow(
  item: JobSourceDetailJob | JobSourceDetailTrackedJob,
): item is JobSourceDetailJob {
  return 'title' in item;
}

export default function SourceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sourceId = Number(id);

  const { data: source, isLoading, isError, error, refetch } = useSourceDetail(sourceId);

  if (isLoading) {
    return <LoadingState label="Loading source…" />;
  }
  if (isError) {
    return <ErrorState error={error} onRetry={refetch} />;
  }
  if (!source) {
    return (
      <ThemedView style={styles.notFoundContainer}>
        <ThemedText type="smallBold">Source not found</ThemedText>
      </ThemedView>
    );
  }

  const rows: (JobSourceDetailJob | JobSourceDetailTrackedJob)[] = source.jobs ?? source.trackedJobs ?? [];
  // Only the global engine sources (linkedin/indeed/remotive) show
  // shared catalog jobs; everything else here is this user's own
  // tracked_jobs — see the type comment for exactly why.
  const isGlobalSource = Boolean(source.jobs);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <ThemedView style={styles.header}>
              <ThemedText type="title" style={styles.title}>
                {source.name}
              </ThemedText>
              {source.base_url ? (
                <ThemedText
                  type="linkPrimary"
                  onPress={() => WebBrowser.openBrowserAsync(source.base_url as string)}>
                  {source.base_url}
                </ThemedText>
              ) : null}
              <ThemedText type="small" themeColor="textSecondary">
                {isGlobalSource
                  ? `${rows.length} recently scraped job${rows.length === 1 ? '' : 's'}`
                  : `${rows.length} of your applications from this source`}
              </ThemedText>
            </ThemedView>
          }
          renderItem={({ item }) =>
            isEngineJobRow(item) ? (
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold" numberOfLines={2}>
                  {item.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.companies?.name ?? 'Unknown company'}
                  {item.location ? ` · ${item.location}` : ''}
                </ThemedText>
                <ThemedView style={styles.cardFooter}>
                  {item.posted_at ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      Posted {formatDate(item.posted_at)}
                    </ThemedText>
                  ) : null}
                  <StatusBadge status={item.status} />
                </ThemedView>
                <ThemedText
                  type="linkPrimary"
                  onPress={() => WebBrowser.openBrowserAsync(item.source_url)}
                  style={styles.link}>
                  View posting ↗
                </ThemedText>
              </ThemedView>
            ) : (
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold" numberOfLines={2}>
                  {item.role}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.company}
                  {item.location ? ` · ${item.location}` : ''}
                </ThemedText>
                <ThemedView style={styles.cardFooter}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Applied {formatDate(item.applicationDate)}
                  </ThemedText>
                  {item.status ? <StatusBadge status={item.status} /> : null}
                </ThemedView>
                {item.sourceUrl ? (
                  <ThemedText
                    type="linkPrimary"
                    onPress={() => WebBrowser.openBrowserAsync(item.sourceUrl as string)}
                    style={styles.link}>
                    View posting ↗
                  </ThemedText>
                ) : null}
              </ThemedView>
            )
          }
          ItemSeparatorComponent={() => <ThemedView style={{ height: Spacing.two }} />}
          ListEmptyComponent={
            <EmptyState
              title="Nothing here yet"
              subtitle={
                isGlobalSource
                  ? 'Nothing has been scraped from this source recently.'
                  : "You haven't added anything from this source yet."
              }
            />
          }
        />
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
  listContent: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  header: {
    gap: Spacing.one,
    marginBottom: Spacing.three,
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    textTransform: 'capitalize',
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  link: {
    marginTop: Spacing.half,
  },
});
