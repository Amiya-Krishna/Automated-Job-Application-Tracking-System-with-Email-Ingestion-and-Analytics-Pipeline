import { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  useEngineApplications,
  useRecordEngineOutcome,
  useSubmitEngineApplication,
} from '@/hooks/use-applications';
import { useTheme } from '@/hooks/use-theme';
import type { EngineApplication } from '@/types/applications';
import { ApiError } from '@/types/api';
import { formatDate } from '@/utils/format';

// The 5 real values applyRoutes.js's applications.status can hold (see
// types/applications.ts's EngineApplication) — "" means no filter, a
// real query param omission, not a 6th status.
const STATUS_FILTERS = ['', 'pending', 'applied', 'interview', 'offer', 'rejected'] as const;

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function EngineApplicationsScreen() {
  const theme = useTheme();
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('');
  const [actingId, setActingId] = useState<number | null>(null);

  const { data, isLoading, isError, error, refetch, isRefetching } = useEngineApplications(
    statusFilter || undefined,
  );
  const submitEngineApplication = useSubmitEngineApplication();
  const recordOutcome = useRecordEngineOutcome();

  const handleSubmit = (item: EngineApplication) => {
    setActingId(item.id);
    submitEngineApplication.mutate(item.id, {
      onError: (err) => Alert.alert('Submit failed', err instanceof ApiError ? err.message : 'Please try again.'),
      onSettled: () => setActingId(null),
    });
  };

  const handleOutcome = (item: EngineApplication, status: 'interview' | 'offer' | 'rejected') => {
    setActingId(item.id);
    recordOutcome.mutate(
      { applicationId: item.id, status },
      {
        onError: (err) =>
          Alert.alert('Failed to update', err instanceof ApiError ? err.message : 'Please try again.'),
        onSettled: () => setActingId(null),
      },
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ThemedView style={styles.intro}>
          <ThemedText type="small" themeColor="textSecondary">
            The automated apply-engine&apos;s own queue — a lower-level, technical view of what
            it has tried to submit and where each attempt stands. For the everyday view of your
            applications, use the Applications tab instead.
          </ThemedText>
        </ThemedView>

        <FlatList
          data={STATUS_FILTERS}
          horizontal
          keyExtractor={(item) => item || 'all'}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterList}
          renderItem={({ item }) => {
            const active = item === statusFilter;
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => setStatusFilter(item)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? theme.tint : theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}>
                <ThemedText type="small" style={active ? styles.filterChipActiveText : undefined}>
                  {item ? capitalize(item) : 'All'}
                </ThemedText>
              </Pressable>
            );
          }}
        />

        {isLoading ? (
          <LoadingState label="Loading queue…" />
        ) : isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <FlatList<EngineApplication>
            data={data ?? []}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.tint} />
            }
            ItemSeparatorComponent={() => <ThemedView style={{ height: Spacing.two }} />}
            ListEmptyComponent={
              <EmptyState
                title="Nothing in the queue"
                subtitle={
                  statusFilter
                    ? `No applications with status "${statusFilter}".`
                    : 'Applications the engine is handling will show up here.'
                }
              />
            }
            renderItem={({ item }) => {
              const isActing = actingId === item.id;
              return (
                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedView style={styles.cardHeader}>
                    <ThemedText type="smallBold" numberOfLines={1} style={styles.cardTitle}>
                      {item.jobs?.title ?? `Application #${item.id}`}
                    </ThemedText>
                    {/* StatusBadge's color map keys on the TrackedJob-style
                        capitalized statuses (Applied/Interview/Offer/Rejected)
                        — capitalizing here reuses those same colors correctly
                        for 4 of the 5 engine statuses. "Pending" has no
                        dedicated color in that map (the web app itself
                        never shows it via StatusBadge — see status-badge.tsx)
                        so it falls back to the same default the component
                        already uses for any unrecognized status. */}
                    <StatusBadge status={capitalize(item.status)} />
                  </ThemedView>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.jobs?.companies?.name ?? 'Unknown company'}
                  </ThemedText>
                  {item.applied_at ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      Applied {formatDate(item.applied_at)}
                    </ThemedText>
                  ) : null}
                  {item.failure_reason ? (
                    <ThemedText type="small" themeColor="danger">
                      {item.failure_reason}
                    </ThemedText>
                  ) : null}

                  <ThemedView style={styles.actionRow}>
                    {item.status === 'pending' ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={isActing}
                        onPress={() => handleSubmit(item)}
                        style={[styles.actionButton, { backgroundColor: theme.tint, opacity: isActing ? 0.6 : 1 }]}>
                        <ThemedText type="small" style={styles.actionButtonText}>
                          {isActing ? 'Submitting…' : 'Submit'}
                        </ThemedText>
                      </Pressable>
                    ) : item.status === 'applied' ? (
                      <>
                        <Pressable
                          accessibilityRole="button"
                          disabled={isActing}
                          onPress={() => handleOutcome(item, 'interview')}
                          style={[styles.actionButtonOutline, { borderColor: theme.border, opacity: isActing ? 0.6 : 1 }]}>
                          <ThemedText type="small">Interview</ThemedText>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          disabled={isActing}
                          onPress={() => handleOutcome(item, 'offer')}
                          style={[styles.actionButtonOutline, { borderColor: theme.border, opacity: isActing ? 0.6 : 1 }]}>
                          <ThemedText type="small">Offer</ThemedText>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          disabled={isActing}
                          onPress={() => handleOutcome(item, 'rejected')}
                          style={[styles.actionButtonOutline, { borderColor: theme.border, opacity: isActing ? 0.6 : 1 }]}>
                          <ThemedText type="small" themeColor="danger">
                            Rejected
                          </ThemedText>
                        </Pressable>
                      </>
                    ) : null}
                  </ThemedView>
                </ThemedView>
              );
            }}
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
  },
  intro: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    backgroundColor: 'transparent',
  },
  filterList: {
    flexGrow: 0,
    marginBottom: Spacing.three,
  },
  filterRow: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
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
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  cardTitle: {
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.two,
    backgroundColor: 'transparent',
  },
  actionButton: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    minHeight: 36,
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#ffffff',
  },
  actionButtonOutline: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    minHeight: 36,
    justifyContent: 'center',
  },
});
