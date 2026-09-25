import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useActivateResume, useDeleteResume, useDownloadOriginalResume, useDownloadResumeExport, useResumeDetail, useResumes, useUploadResume } from '@/hooks/use-resume';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/types/api';
import type { ResumeListItem, VersionSummary } from '@/types/resume';

// 2 MB, matching the backend's hard limit (server/services/resumeTailoring/constants.js).
// Checked here purely for fast, friendly feedback — the backend re-validates regardless.
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
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
  const [viewingText, setViewingText] = useState(false);
  const detail = useResumeDetail(viewingText ? r.id : null);
  const download = useDownloadOriginalResume();
  const exportOriginal = useDownloadResumeExport();

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
        <Button label={`${viewingText ? 'Hide text' : 'View text'}`} variant="ghost" onPress={() => setViewingText((v) => !v)} />
        {r.hasFile ? (
          <Button
            label={download.isPending ? 'Preparing…' : 'Download original'}
            variant="ghost"
            disabled={download.isPending}
            onPress={() => download.mutate(r.id, { onError: (e) => Alert.alert('Download failed', errMsg(e)) })}
          />
        ) : null}
        {r.isActive ? (
          <Button
            label={exportOriginal.isPending ? 'Preparing PDF…' : 'Export PDF'}
            variant="ghost"
            disabled={exportOriginal.isPending}
            onPress={() => exportOriginal.mutate({ id: 'original', format: 'pdf' }, { onError: (e) => Alert.alert('Export failed', errMsg(e)) })}
          />
        ) : null}
        <Button label={`${open ? 'Hide' : 'Versions'}${r.versionCount ? ` (${r.versionCount})` : ''}`} variant="ghost" onPress={() => setOpen((v) => !v)} />
        {r.sourceType === 'profile_text' ? <Button label="Edit profile text" variant="ghost" onPress={() => router.push('/account/edit')} /> : null}
        <Button label="Delete" variant="danger" disabled={busy} onPress={onDelete} />
      </View>

      {viewingText ? (
        <ThemedView type="backgroundElement" style={styles.textPreview}>
          {detail.isLoading ? (
            <ThemedText type="small" themeColor="textSecondary">
              Loading…
            </ThemedText>
          ) : detail.isError ? (
            <ThemedText type="small" themeColor="danger">
              {errMsg(detail.error)}
            </ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              {detail.data?.resumeText || 'No parsed text available.'}
            </ThemedText>
          )}
        </ThemedView>
      ) : null}

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
  const upload = useUploadResume();
  const [syncProfile, setSyncProfile] = useState(true);

  const pickAndUpload = async () => {
    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
        multiple: false,
      });
    } catch {
      Alert.alert('Could not open file picker', 'Please try again.');
      return;
    }
    if (picked.canceled || !picked.assets?.length) return;
    const asset = picked.assets[0];

    // Fast, friendly checks — same rules the backend enforces server-side (it re-validates regardless).
    if (asset.mimeType && !ALLOWED_MIME.has(asset.mimeType)) {
      Alert.alert('Unsupported file', 'Only PDF and DOCX resumes are supported.');
      return;
    }
    if (typeof asset.size === 'number' && asset.size > MAX_UPLOAD_BYTES) {
      Alert.alert('File too large', `That file is too large. The limit is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
      return;
    }

    upload.mutate(
      { file: { uri: asset.uri, name: asset.name, mimeType: asset.mimeType }, syncProfile },
      {
        onSuccess: () => Alert.alert('Resume uploaded', `“${asset.name}” was uploaded and set as your active resume.`),
        onError: (e) => Alert.alert('Upload failed', errMsg(e)),
      },
    );
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
              PDF or DOCX, up to 2 MB. It's uploaded straight to your TrackTrail account — the same backend record the web app and browser extension use — and becomes your active resume. Nothing is kept on this device.
            </ThemedText>
            {resumes.length === 0 ? (
              <ThemedText type="small" themeColor="danger">
                Upload your resume before tailoring.
              </ThemedText>
            ) : null}
            <View style={styles.row}>
              <Switch value={syncProfile} onValueChange={setSyncProfile} trackColor={{ true: theme.tint }} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                Also use it as my profile text for job matching
              </ThemedText>
            </View>
            <Button label={upload.isPending ? 'Uploading…' : 'Upload PDF or DOCX'} disabled={upload.isPending} onPress={pickAndUpload} />
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
  textPreview: { borderRadius: Spacing.two, padding: Spacing.three },
  versionRow: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.three, gap: Spacing.one },
});
