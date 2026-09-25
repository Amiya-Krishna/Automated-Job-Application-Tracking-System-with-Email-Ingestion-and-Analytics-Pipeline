import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { FormTextInput } from '@/components/form-text-input';
import { LoadingState } from '@/components/loading-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useDeleteScrapeRun, useScrapeHistory, useScrapeRunStatus, useTriggerScrape } from '@/hooks/use-scrape';
import { useSources } from '@/hooks/use-sources';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/types/api';
import type { ScrapeRun } from '@/types/scrape';

// Same three adapters the web client offers (client/src/pages/JobDiscovery.jsx) —
// LinkedIn/Indeed have no public self-serve search API and are unimplemented
// placeholders server-side even with a source selected, so this says so rather
// than implying they'll start working.
const DISCOVERY_SOURCES = [
  { value: 'remotive', label: 'Remotive', note: 'Real remote listings' },
  { value: 'linkedin', label: 'LinkedIn', note: 'Not implemented yet' },
  { value: 'indeed', label: 'Indeed', note: 'Not implemented yet' },
] as const;

const RUN_STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  blocked: 'Blocked',
};

function fmtDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Honest summary of a finished run — never implies jobs were found when every source came back empty/blocked. */
function RunResultsSummary({ run }: { run: ScrapeRun }) {
  const entries = Object.entries(run.results ?? {});
  if (entries.length === 0) return null;
  const totalFound = entries.reduce((sum, [, r]) => sum + (r.found || 0), 0);
  const totalIngested = entries.reduce((sum, [, r]) => sum + (r.ingested || 0), 0);
  const allUnavailable = entries.every(([, r]) => r.status === 'unavailable' || r.status === 'blocked');

  return (
    <ThemedView style={styles.resultsBlock}>
      <ThemedText type="small" themeColor={allUnavailable ? 'danger' : 'textSecondary'}>
        {allUnavailable
          ? 'Providers were unavailable — no jobs were imported.'
          : `Found ${totalFound} listing${totalFound === 1 ? '' : 's'}, imported ${totalIngested} new job${totalIngested === 1 ? '' : 's'}.`}
      </ThemedText>
      {entries.map(([source, r]) => (
        <ThemedText key={source} type="small" themeColor="textSecondary">
          {source}: {r.status}
          {r.message ? ` — ${r.message}` : ''}
        </ThemedText>
      ))}
    </ThemedView>
  );
}

function DiscoveryRunCard({ run, onDelete, deleting }: { run: ScrapeRun; onDelete: () => void; deleting: boolean }) {
  const theme = useTheme();
  const live = useScrapeRunStatus(run.status === 'queued' || run.status === 'running' ? run.id : null);
  const current = live.data ?? run;

  return (
    <Card style={styles.runCard}>
      <View style={styles.runHead}>
        <View style={styles.flex}>
          <ThemedText type="smallBold">{current.query}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {[current.location, current.sources.join(', '), fmtDateTime(current.createdAt)].filter(Boolean).join(' · ')}
          </ThemedText>
        </View>
        <ThemedText type="smallBold" themeColor={current.status === 'failed' ? 'danger' : current.status === 'succeeded' ? 'tint' : 'textSecondary'}>
          {RUN_STATUS_LABEL[current.status] ?? current.status}
        </ThemedText>
      </View>
      <RunResultsSummary run={current} />
      <View style={styles.row}>
        <Button label={deleting ? 'Removing…' : 'Remove'} variant="ghost" disabled={deleting} onPress={onDelete} />
      </View>
    </Card>
  );
}

function DiscoveryPanel() {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [sources, setSources] = useState<string[]>(['remotive']);
  const [formError, setFormError] = useState<string | null>(null);

  const trigger = useTriggerScrape();
  const history = useScrapeHistory();
  const remove = useDeleteScrapeRun();
  const [removingId, setRemovingId] = useState<number | null>(null);

  const toggleSource = (value: string) =>
    setSources((prev) => (prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]));

  const runDiscovery = () => {
    setFormError(null);
    if (!query.trim()) return setFormError('Enter a search query first.');
    if (sources.length === 0) return setFormError('Select at least one provider.');

    trigger.mutate(
      { query: query.trim(), location: location.trim() || undefined, sources, limit: 25 },
      { onError: (e) => setFormError(e instanceof ApiError ? e.message : 'Failed to start discovery run.') },
    );
  };

  const confirmRemove = (run: ScrapeRun) => {
    Alert.alert('Remove this run?', `Remove the discovery run "${run.query}" from your history? This won't affect any jobs already imported.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setRemovingId(run.id);
          remove.mutate(run.id, {
            onSettled: () => setRemovingId(null),
            onError: (e) => Alert.alert('Could not remove', e instanceof ApiError ? e.message : 'Please try again.'),
          });
        },
      },
    ]);
  };

  return (
    <ThemedView style={styles.discovery}>
      <ThemedText type="title" style={styles.title}>
        Discover jobs
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Trigger a scan for new listings — same discovery engine and job catalog the web app and browser extension use.
      </ThemedText>

      <Card style={styles.card}>
        <FormTextInput label="Search query" placeholder="e.g. Software engineer intern" value={query} onChangeText={setQuery} />
        <FormTextInput label="Location (optional)" placeholder="e.g. Remote" value={location} onChangeText={setLocation} />
        <ThemedText type="smallBold">Providers</ThemedText>
        <View style={styles.chipsRow}>
          {DISCOVERY_SOURCES.map((s) => (
            <Pressable
              key={s.value}
              accessibilityRole="button"
              onPress={() => toggleSource(s.value)}
              style={[
                styles.chip,
                { borderColor: theme.border },
                sources.includes(s.value) ? { backgroundColor: theme.tint, borderColor: theme.tint } : null,
              ]}>
              <ThemedText type="small" style={sources.includes(s.value) ? { color: '#fff' } : undefined}>
                {s.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
        {formError ? (
          <ThemedText type="small" themeColor="danger">
            {formError}
          </ThemedText>
        ) : null}
        <Button label={trigger.isPending ? 'Starting…' : 'Run discovery'} disabled={trigger.isPending} onPress={runDiscovery} />
      </Card>

      {history.isLoading ? (
        <LoadingState label="Loading discovery history…" />
      ) : history.isError ? (
        <ErrorState error={history.error} onRetry={() => history.refetch()} />
      ) : !history.data || history.data.length === 0 ? (
        <EmptyState title="No discovery runs yet" subtitle="Run a search above to start pulling in new listings." />
      ) : (
        <ThemedView style={styles.list}>
          <ThemedText type="smallBold">Recent runs</ThemedText>
          {history.data.map((run) => (
            <DiscoveryRunCard key={run.id} run={run} deleting={removingId === run.id} onDelete={() => confirmRemove(run)} />
          ))}
        </ThemedView>
      )}
    </ThemedView>
  );
}

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
            <DiscoveryPanel />

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
              <ThemedView style={styles.sourcesList}>
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
  discovery: {
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  card: {
    gap: Spacing.two,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  sourcesList: {
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  runCard: {
    gap: Spacing.two,
  },
  runHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  resultsBlock: {
    gap: Spacing.half,
    backgroundColor: 'transparent',
  },
});