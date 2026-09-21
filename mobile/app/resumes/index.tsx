import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useActivateResume, useDeleteResume, useResumes } from '@/hooks/use-resume';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/types/api';
import type { ResumeListItem, VersionSummary } from '@/types/resume';

const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? '').replace(/\/+$/, '');
const TYPE_LABEL: Record<string, string> = { pdf: 'PDF', docx: 'DOCX', text: 'Profile text' };
const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const provenance = (v: VersionSummary) => (v.aiUsed ? `AI-assisted · ${v.aiProvider ?? 'provider'}` : 'Reorder-only');
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Please try again.');

function VersionRow({ v }: { v: VersionSummary }) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={[styles.versionRow, { borderColor: theme.border }]}>
      <ThemedText type="smallBold">
        {v.targetTitle} — {v.targetCompany}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {[fmt(v.createdAt), v.matchScore === null ? null : `Match ${v.matchScore}%`, provenance(v), v.status].filter(Boolean).join(' · ')}
      </ThemedText>
      <Button label="Open" variant="secondary" onPress={() => router.push({ pathname: '/tailor', params: { versionId: String(v.id) } })} />
    </ThemedView>
  );
}

function ResumeCard({ r, busy, onUse, onDelete }: { r: ResumeListItem; busy: boolean; onUse: () => void; onDelete: () => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Card style={[styles.card, r.isActive ? { borderColor: theme.tint, borderWidth: 1 } : null]}>
      <View style={styles.headRow}>
        <View style={styles.flex}>
          <ThemedText type="smallBold">{r.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Uploaded {fmt(r.createdAt)} · {TYPE_LABEL[r.fileType ?? ''] ?? 'Resume'} · {r.factsCount} facts parsed
          </ThemedText>
        </View>
        <ThemedText type="smallBold" themeColor={r.isActive ? 'tint' : 'textSecondary'}>
          {r.isActive ? 'Active' : 'Available'}
        </ThemedText>
      </View>

      <View style={styles.row}>
        <Button label={r.isActive ? 'In use for tailoring' : 'Use for tailoring'} variant={r.isActive ? 'secondary' : 'primary'} disabled={r.isActive || busy} onPress={onUse} />
        <Button label={`${open ? 'Hide' : 'Versions'}${r.versionCount ? ` (${r.versionCount})` : ''}`} variant="ghost" onPress={() => setOpen((v) => !v)} />
        {r.sourceType === 'profile_text' ? (
          <Button label="Edit profile text" variant="ghost" onPress={() => router.push('/account/edit')} />
        ) : (
          <Button label="Delete" variant="danger" disabled={busy} onPress={onDelete} />
        )}
      </View>

      {open ? (
        <View style={styles.versions}>
          <ThemedText type="small" themeColor="textSecondary">
            Original Resume · {r.isActive ? 'current / active' : 'not active'}
          </ThemedText>
          {r.versions.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No tailored versions yet. Open a job and choose Tailor Resume.
            </ThemedText>
          ) : (
            r.versions.map((v) => <VersionRow key={v.id} v={v} />)
          )}
        </View>
      ) : null}
    </Card>
  );
}

export default function MyResumesScreen() {
  const theme = useTheme();
  const list = useResumes();
  const activate = useActivateResume();
  const remove = useDeleteResume();

  const uploadOnWeb = () => {
    // PDF/DOCX are validated, parsed and stored by the TrackTrail backend. The web app uploads them
    // through the same secure endpoint; this app just lists what the backend has (no local copies).
    if (!WEB_URL) {
      Alert.alert('Upload on the web app', 'Open the TrackTrail web app, go to My Resumes, and upload your PDF or DOCX there. It will appear here automatically.');
      return;
    }
    void WebBrowser.openBrowserAsync(`${WEB_URL}/resumes`);
  };

  const confirmDelete = (r: ResumeListItem) => {
    const n = r.versionCount;
    Alert.alert(`Delete “${r.name}”?`, `${n ? `This also deletes its ${n} tailored version${n === 1 ? '' : 's'}. ` : ''}This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(r.id, { onError: (e) => Alert.alert('Could not delete', errMsg(e)) }) },
    ]);
  };

  if (list.isLoading) return <LoadingState label="Loading your resumes…" />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;

  const resumes = list.data?.resumes ?? [];
  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} tintColor={theme.tint} />}>
          <Card style={styles.card}>
            <ThemedText type="smallBold">Upload a resume</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              PDF or DOCX. Uploads go through the secure TrackTrail web app and are stored on your account; they appear here automatically. Nothing is kept on this device.
            </ThemedText>
            {resumes.length === 0 ? (
              <ThemedText type="small" themeColor="danger">
                Upload your resume before tailoring.
              </ThemedText>
            ) : null}
            <Button label="Upload on the web app" onPress={uploadOnWeb} />
          </Card>

          {resumes.map((r) => (
            <ResumeCard key={r.id} r={r} busy={activate.isPending || remove.isPending} onUse={() => activate.mutate(r.id, { onError: (e) => Alert.alert('Could not switch resume', errMsg(e)) })} onDelete={() => confirmDelete(r)} />
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  card: { gap: Spacing.two },
  headRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  versions: { gap: Spacing.two },
  versionRow: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.three, gap: Spacing.one },
});
