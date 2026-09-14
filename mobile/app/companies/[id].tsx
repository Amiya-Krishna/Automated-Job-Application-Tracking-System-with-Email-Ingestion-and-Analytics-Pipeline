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
import { useCompanyDetail } from '@/hooks/use-companies';
import type { CompanyDetailJob } from '@/types/companies';
import { formatDate } from '@/utils/format';

export default function CompanyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const companyId = Number(id);

  const { data: company, isLoading, isError, error, refetch } = useCompanyDetail(companyId);

  if (isLoading) {
    return <LoadingState label="Loading company…" />;
  }
  if (isError) {
    return <ErrorState error={error} onRetry={refetch} />;
  }
  if (!company) {
    return (
      <ThemedView style={styles.notFoundContainer}>
        <ThemedText type="smallBold">Company not found</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <FlatList<CompanyDetailJob>
          data={company.jobs}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <ThemedView style={styles.header}>
              <ThemedText type="title" style={styles.title}>
                {company.name}
              </ThemedText>
              {company.domain ? (
                <ThemedText type="small" themeColor="tint">
                  {company.domain}
                </ThemedText>
              ) : null}
              <ThemedText type="small" themeColor="textSecondary">
                {company.jobs.length} recent job{company.jobs.length === 1 ? '' : 's'} scraped
              </ThemedText>
            </ThemedView>
          }
          renderItem={({ item }) => (
            <ThemedView type="backgroundElement" style={styles.jobCard}>
              <ThemedText type="smallBold" numberOfLines={2}>
                {item.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {[item.location, item.remote_type].filter(Boolean).join(' · ') || 'Location not listed'}
              </ThemedText>
              <ThemedView style={styles.jobFooter}>
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
          )}
          ItemSeparatorComponent={() => <ThemedView style={{ height: Spacing.two }} />}
          ListEmptyComponent={
            <EmptyState
              title="No jobs on file"
              subtitle="Nothing has been scraped for this company recently."
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
  },
  jobCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  jobFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  link: {
    marginTop: Spacing.half,
  },
});
