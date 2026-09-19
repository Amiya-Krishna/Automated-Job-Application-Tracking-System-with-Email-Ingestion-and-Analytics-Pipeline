import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { JobCard } from '@/components/job-card';
import { LoadingState } from '@/components/loading-state';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSavedJobs } from '@/hooks/use-saved-jobs';
import type { EngineJob } from '@/types/jobs';

export default function SavedJobsScreen() {
  const { jobs, isLoading, toggleSaved } = useSavedJobs();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Saved Jobs" />

        {isLoading ? (
          <LoadingState label="Loading saved jobs…" />
        ) : (
          <FlatList<EngineJob>
            data={jobs}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <JobCard item={item} isSaved onToggleSaved={() => toggleSaved(item)} />
            )}
            ItemSeparatorComponent={() => <ThemedView style={{ height: Spacing.two }} />}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <EmptyState
                title="No saved jobs yet"
                subtitle="Tap the ☆ on any job in the Jobs tab to bookmark it for later."
              />
            }
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, gap: Spacing.three },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
});
