import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { LoadingState } from '@/components/loading-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
    useApproveVersion,
    useCachedMatchAnalysis,
    useDownloadResumeExport,
    useJobAnalysis,
    usePreviewVersion,
    useResumes,
    useTailoring,
    useVersion,
} from '@/hooks/use-resume';
import { useTheme } from '@/hooks/use-theme';
import { STAGES, jobFromKey } from '@/services/resume';
import { ApiError } from '@/types/api';
import type { MatchState, ResumeChange, ResumeJobInput, ResumeRequirement, ReviewDecision } from '@/types/resume';

const STATE_ICON: Record<MatchState, string> = { MATCHED: '✓', PARTIAL_MATCH: '⚠', NOT_FOUND: '✕' };
const SECTION_LABEL: Record<string, string> = { summary: 'Summary', experience: 'Experience', projects: 'Projects', skills: 'Skills' };
const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? '').replace(/\/+$/, '');

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card style={styles.section}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {children}
    </Card>
  );
}

function SkillChip({ req }: { req: ResumeRequirement }) {
  const theme = useTheme();
  const color = req.state === 'MATCHED' ? theme.tint : req.state === 'NOT_FOUND' ? theme.danger : theme.textSecondary;
  return (
    <View accessibilityLabel={`${req.requirement}: ${req.label}`} style={[styles.chip, { borderColor: color }]}>
      <ThemedText type="small" style={{ color }}>
        {STATE_ICON[req.state]} {req.requirement}
      </ThemedText>
    </View>
  );
}

function ChangeCard({ change, decision, reviewMode, readOnly, onDecide }: {
  change: ResumeChange;
  decision: ReviewDecision;
  reviewMode: boolean;
  readOnly: boolean;
  onDecide: (id: string, d: ReviewDecision) => void;
}) {
  const theme = useTheme();
  const [showEvidence, setShowEvidence] = useState(false);
  const status = readOnly ? change.status : decision;
  return (
    <ThemedView type="backgroundElement" style={[styles.changeCard, { borderColor: theme.border }]}>
      <View style={styles.changeHead}>
        <ThemedText type="smallBold">
          {SECTION_LABEL[change.section] ?? change.section} · {change.op === 'reorder' ? 'Reordered' : 'Reworded'}
        </ThemedText>
        {status !== 'pending' ? (
          <ThemedText type="small" themeColor={status === 'accepted' ? 'tint' : 'danger'}>
            {status === 'accepted' ? 'Accepted' : 'Rejected'}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary">Original</ThemedText>
      <ThemedText type="small">{change.original}</ThemedText>
      <ThemedText type="small" themeColor="tint">Tailored</ThemedText>
      <ThemedText type="small">{change.proposed}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">Reason: {change.reason}</ThemedText>
      {change.evidence.length > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => setShowEvidence((v) => !v)}>
          <ThemedText type="linkPrimary">{showEvidence ? 'Hide' : 'Show'} evidence from your resume ({change.evidence.length})</ThemedText>
        </Pressable>
      ) : null}
      {showEvidence ? change.evidence.map((e) => (
        <ThemedText key={e.factId} type="small" themeColor="textSecondary">“{e.text}”</ThemedText>
      )) : null}
      {reviewMode && !readOnly ? (
        <View style={styles.row}>
          <Button label="Accept" variant={decision === 'accepted' ? 'primary' : 'secondary'} onPress={() => onDecide(change.id, 'accepted')} />
          <Button label="Reject" variant={decision === 'rejected' ? 'danger' : 'secondary'} onPress={() => onDecide(change.id, 'rejected')} />
        </View>
      ) : null}
    </ThemedView>
  );
}

export default function TailorScreen() {
  const theme = useTheme();
  const {
    jobKey,
    versionId: versionParam,
    analysisKey: analysisParam,
    resumeId: resumeParam,
  } = useLocalSearchParams<{ jobKey?: string; versionId?: string; analysisKey?: string; resumeId?: string }>();

  const [versionId, setVersionId] = useState<number | null>(versionParam ? Number(versionParam) : null);
  const [activeJob, setActiveJob] = useState<ResumeJobInput | null>(() =>
    versionParam || analysisParam ? null : jobFromKey(jobKey),
  );
  const [paste, setPaste] = useState({ title: '', company: '', description: '' });
  const [selectedResumeId, setSelectedResumeId] = useState<number | null>(resumeParam ? Number(resumeParam) : null);
  const [reviewMode, setReviewMode] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>({});
  const [previewText, setPreviewText] = useState<string | null>(null);

  const resumesQ = useResumes();
  useEffect(() => {
    if (selectedResumeId !== null) return;
    if (resumesQ.data?.activeResumeId) setSelectedResumeId(resumesQ.data.activeResumeId);
  }, [resumesQ.data?.activeResumeId, selectedResumeId]);

  const analysisQ = useJobAnalysis(activeJob, selectedResumeId ?? undefined);
  // Read-only entry point (mirrors the web client's `?analysis=&resume=`
  // deep link — see ResumeTailoring.jsx): re-use the server's already
  // computed, deterministic analysis for a job instead of paying for a
  // fresh `POST /resume/analyze` run.
  const cachedAnalysisQ = useCachedMatchAnalysis(analysisParam ?? null, selectedResumeId ?? (resumeParam ? Number(resumeParam) : undefined));
  const versionQ = useVersion(versionId);
  const tailoring = useTailoring();
  const approve = useApproveVersion();
  const preview = usePreviewVersion();
  const exportVersion = useDownloadResumeExport();

  const version = versionQ.data ?? null;
  // the resume this job is tailored with: the version's own resume, else the backend's active one
  const usedResume = (version ? resumesQ.data?.resumes.find((r) => r.id === version.resumeId) : resumesQ.data?.resumes.find((r) => r.id === (selectedResumeId ?? resumesQ.data?.activeResumeId))) ?? null;
  const analysis = version?.analysis ?? analysisQ.data ?? cachedAnalysisQ.data ?? null;
  const draft = version?.status === 'draft';
  const apiCode =
    (analysisQ.error instanceof ApiError ? analysisQ.error.apiCode : null) ??
    (cachedAnalysisQ.error instanceof ApiError ? cachedAnalysisQ.error.apiCode : null) ??
    (tailoring.error?.apiCode ?? null);
  const errorMessage = (analysisQ.error as Error | null)?.message ?? (cachedAnalysisQ.error as Error | null)?.message ?? tailoring.error?.message ?? null;

  // Live preview while reviewing: the SERVER applies the decisions (the app never re-implements it).
  const previewMutate = preview.mutate;
  useEffect(() => {
    if (!reviewMode || !version || version.status !== 'draft') return undefined;
    const t = setTimeout(() => previewMutate({ id: version.id, decisions }, { onSuccess: (p) => setPreviewText(p.resumeText) }), 250);
    return () => clearTimeout(t);
  }, [decisions, reviewMode, version, previewMutate]);

  const jobForTailoring = useMemo<ResumeJobInput | null>(() => {
    if (activeJob) return activeJob;
    if (version) {
      return jobFromKey(version.jobKey) ?? {
        title: version.targetTitle,
        company: version.targetCompany,
        description: version.analysis.jd.description,
      };
    }
    // Ad-hoc job reached via the cached-analysis deep link (analysisKey):
    // re-use the JD text the server already stored with that analysis.
    if (analysisParam && cachedAnalysisQ.data?.jd) {
      const { title, company, location, description } = cachedAnalysisQ.data.jd;
      return { title, company, location, description, sourceName: 'extension' };
    }
    return null;
  }, [activeJob, version, analysisParam, cachedAnalysisQ.data]);

  const currentResumeId = selectedResumeId ?? resumesQ.data?.activeResumeId ?? null;
  const chooseableResumes = resumesQ.data?.resumes ?? [];
  const canChooseResume = chooseableResumes.length > 0;

  const submitPaste = () => {
    const description = paste.description.trim();
    const base = jobFromKey(jobKey);
    setActiveJob(base ? { ...base, description } : { title: paste.title.trim(), company: paste.company.trim(), description, sourceName: 'manual' });
  };

  const generate = async (regenerate = false) => {
    if (!jobForTailoring) return;
    const id = await tailoring.run(jobForTailoring, regenerate, currentResumeId ?? undefined);
    if (id !== null) {
      setVersionId(id);
      setDecisions({});
      setReviewMode(false);
      setPreviewText(null);
    }
  };

  const finalize = (action: 'accept_all' | 'reject_all' | 'review') => {
    if (!version) return;
    approve.mutate(
      { id: version.id, action, decisions: action === 'review' ? decisions : undefined },
      {
        onSuccess: (v) => {
          setReviewMode(false);
          setPreviewText(null);
          Alert.alert(v.status === 'rejected' ? 'No changes applied' : 'Saved', v.status === 'rejected' ? 'Your original wording is kept.' : `“${v.label}” is saved to your resume versions.`);
        },
        onError: (e) => Alert.alert('Could not save', e instanceof ApiError ? e.message : 'Please try again.'),
      },
    );
  };

  const acceptedCount = Object.values(decisions).filter((d) => d === 'accepted').length;
  const shownText = previewText ?? version?.resumeText ?? '';
  const needsJd = apiCode === 'jd_too_short';
  const needsResume = apiCode === 'no_resume' || apiCode === 'resume_unreadable';

  if (versionParam && versionQ.isLoading) return <LoadingState label="Loading tailored resume…" />;
  if (!versionParam && analysisParam && cachedAnalysisQ.isLoading) return <LoadingState label="Loading analysis…" />;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* 1. Job overview */}
          <Section title="Job overview">
            <ThemedText type="default" style={styles.jobTitle}>{analysis?.jd.title || version?.targetTitle || 'Paste a job description'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {[analysis?.jd.company || version?.targetCompany, analysis?.jd.location, analysis?.jd.employmentType].filter(Boolean).join(' · ') || 'Match your existing resume to a job, using only what is already true about you.'}
            </ThemedText>
          </Section>

          {usedResume ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/resumes')}>
              <ThemedText type="small" themeColor="textSecondary">
                Resume: {usedResume.name} <ThemedText type="linkPrimary">Change</ThemedText>
              </ThemedText>
            </Pressable>
          ) : null}

          {canChooseResume && !version ? (
            <Section title="Select resume for this job">
              <ThemedText type="small" themeColor="textSecondary">
                The backend will analyze and tailor only the resume you choose here.
              </ThemedText>
              <View style={styles.resumeList}>
                {chooseableResumes.map((resume) => {
                  const selected = (selectedResumeId ?? resumesQ.data?.activeResumeId) === resume.id;
                  return (
                    <Pressable
                      key={resume.id}
                      accessibilityRole="button"
                      onPress={() => setSelectedResumeId(resume.id)}
                      style={[
                        styles.resumeOption,
                        { borderColor: selected ? theme.tint : theme.border, backgroundColor: selected ? `${theme.tint}14` : 'transparent' },
                      ]}>
                      <ThemedText type="smallBold">{resume.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {[resume.fileType ? resume.fileType.toUpperCase() : null, resume.isActive ? 'Active' : 'Available'].filter(Boolean).join(' · ')}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </Section>
          ) : null}

          {analysisQ.isFetching && !analysis ? <ActivityIndicator color={theme.tint} /> : null}

          {needsResume ? (
            <Section title="Resume needed">
              <ThemedText type="small" themeColor="danger">{errorMessage}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Paste your resume text in your profile (or upload a PDF/DOCX on the web app). Your resume is the only source of truth for tailoring.
              </ThemedText>
              <Button label="Add resume to profile" onPress={() => router.push('/account/edit')} />
            </Section>
          ) : null}

          {/* Pasted JD: for ad-hoc jobs, or a tracked job whose description is missing/too short */}
          {!analysis && !needsResume && (needsJd || !activeJob) ? (
            <Section title="Paste the job description">
              {errorMessage && needsJd ? <ThemedText type="small" themeColor="danger">{errorMessage}</ThemedText> : null}
              {!jobFromKey(jobKey) ? (
                <>
                  <TextInput style={[styles.input, { color: theme.text, borderColor: theme.border }]} placeholder="Job title" placeholderTextColor={theme.textSecondary} value={paste.title} onChangeText={(v) => setPaste((p) => ({ ...p, title: v }))} />
                  <TextInput style={[styles.input, { color: theme.text, borderColor: theme.border }]} placeholder="Company" placeholderTextColor={theme.textSecondary} value={paste.company} onChangeText={(v) => setPaste((p) => ({ ...p, company: v }))} />
                </>
              ) : null}
              <TextInput
                multiline
                textAlignVertical="top"
                style={[styles.input, styles.multiline, { color: theme.text, borderColor: theme.border }]}
                placeholder="Paste the full job description…"
                placeholderTextColor={theme.textSecondary}
                value={paste.description}
                onChangeText={(v) => setPaste((p) => ({ ...p, description: v }))}
              />
              <Button label="Analyze job" disabled={paste.description.trim().length < 20} onPress={submitPaste} />
            </Section>
          ) : null}

          {errorMessage && !needsJd && !needsResume ? (
            <ThemedView style={[styles.banner, { borderColor: theme.danger }]}>
              <ThemedText type="small" themeColor="danger">{errorMessage}</ThemedText>
            </ThemedView>
          ) : null}

          {analysis ? (
            <>
              {/* 2. Match score */}
              <Section title="Match score">
                <ThemedText type="title" themeColor="tint">{analysis.matchScore === null ? '—' : `${analysis.matchScore}%`}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Based only on skills your resume actually supports. Missing skills are never added to raise this number. ATS readiness: {analysis.ats.score}/100.
                </ThemedText>
                {analysis.warnings.map((w) => <ThemedText key={w} type="small" themeColor="textSecondary">{w}</ThemedText>)}
              </Section>

              {/* 3. Required skills */}
              <Section title="Required skills">
                <View style={styles.chipRow}>
                  {analysis.requirements.filter((r) => r.type !== 'preferred').map((r) => <SkillChip key={r.id} req={r} />)}
                  {analysis.requirements.every((r) => r.type === 'preferred') ? <ThemedText type="small" themeColor="textSecondary">No specific required skills were recognised.</ThemedText> : null}
                </View>
                {analysis.requirements.some((r) => r.type === 'preferred') ? (
                  <>
                    <ThemedText type="small" themeColor="textSecondary">Preferred</ThemedText>
                    <View style={styles.chipRow}>{analysis.requirements.filter((r) => r.type === 'preferred').map((r) => <SkillChip key={r.id} req={r} />)}</View>
                  </>
                ) : null}
              </Section>

              {/* 4. Matched skills */}
              <Section title="Matched skills">
                {analysis.matchedSkills.length ? (
                  <ThemedText type="small">{analysis.matchedSkills.join(', ')}</ThemedText>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">None of the job's skills were found on your resume.</ThemedText>
                )}
                {analysis.partialSkills.length ? (
                  <ThemedText type="small" themeColor="textSecondary">Related experience only (not claimed): {analysis.partialSkills.join(', ')}</ThemedText>
                ) : null}
              </Section>

              {/* 5. Missing skills */}
              <Section title="Missing skills">
                {analysis.missingSkills.length ? (
                  <>
                    <ThemedText type="small" themeColor="danger">{analysis.missingSkills.join(', ')}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">Missing / Not found in your profile. These will not be added to your resume.</ThemedText>
                  </>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">Nothing missing.</ThemedText>
                )}
              </Section>

              {/* 6. Suggested changes */}
              <Section title="Suggested changes">
                {tailoring.isRunning ? (
                  <View style={styles.steps}>
                    {STAGES.slice(0, 5).map((s, i) => {
                      const idx = Math.max(0, STAGES.findIndex((x) => x.key === tailoring.stage));
                      return (
                        <ThemedText key={s.key} type={i === idx ? 'smallBold' : 'small'} themeColor={i <= idx ? 'text' : 'textSecondary'}>
                          {i < idx ? '✓ ' : ''}{s.label}
                        </ThemedText>
                      );
                    })}
                  </View>
                ) : !version ? (
                  <>
                    <ThemedText type="small" themeColor="textSecondary">
                      TrackTrail will only reorder and reword what is already on your resume. You review every change before anything is applied, and your original is never modified.
                    </ThemedText>
                    <Button label="Generate tailored resume" onPress={() => generate(false)} disabled={!jobForTailoring} />
                  </>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    {version.changes.length} suggested change{version.changes.length === 1 ? '' : 's'}{version.aiUsed ? ' (AI-assisted, validated against your resume)' : ''}. Nothing is applied until you approve.
                  </ThemedText>
                )}
                {tailoring.notes.map((n) => <ThemedText key={n} type="small" themeColor="textSecondary">{n}</ThemedText>)}
              </Section>
            </>
          ) : null}

          {version ? (
            <>
              {/* 7. Resume preview */}
              <Section title={draft ? 'Resume preview' : `Resume · ${version.status}`}>
                <ThemedText type="small" selectable>{shownText}</ThemedText>
              </Section>

              {/* 8. Change review */}
              <Section title="Change review">
                {draft && version.changes.length > 0 ? (
                  <View style={styles.row}>
                    <Button label="Accept all" onPress={() => finalize('accept_all')} loading={approve.isPending} />
                    <Button label="Reject all" variant="secondary" onPress={() => finalize('reject_all')} disabled={approve.isPending} />
                    <Button label={reviewMode ? 'Hide review' : 'Review changes'} variant="ghost" onPress={() => setReviewMode((m) => !m)} />
                  </View>
                ) : null}
                {draft && version.changes.length === 0 ? <Button label="Keep original" variant="secondary" onPress={() => finalize('reject_all')} /> : null}
                {version.changes.length === 0 ? <ThemedText type="small" themeColor="textSecondary">No safe improvements were found. Your resume was left exactly as it is.</ThemedText> : null}
                {version.changes.map((c) => (
                  <ChangeCard key={c.id} change={c} decision={decisions[c.id] ?? 'pending'} reviewMode={reviewMode} readOnly={!draft} onDecide={(id, d) => setDecisions((cur) => ({ ...cur, [id]: d }))} />
                ))}
                {version.unsupportedClaims.length > 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {version.unsupportedClaims.length} AI suggestion{version.unsupportedClaims.length === 1 ? ' was' : 's were'} blocked by the safety check because they were not supported by your resume.
                  </ThemedText>
                ) : null}
                {version.recommendations.map((r, i) => <ThemedText key={`${r.type}-${i}`} type="small" themeColor="textSecondary">• {r.message}</ThemedText>)}
              </Section>

              {/* 9. Save version */}
              {draft && reviewMode ? (
                <Section title="Save version">
                  <ThemedText type="small" themeColor="textSecondary">{acceptedCount} of {version.changes.length} changes accepted. Changes you don't accept are not applied.</ThemedText>
                  <Button label={`Save “${version.label}”`} onPress={() => finalize('review')} loading={approve.isPending} />
                </Section>
              ) : null}

              {/* 10. Export */}
              {!draft ? (
                <Section title="Export">
                  <View style={styles.row}>
                    <Button label="Share as text" onPress={() => Share.share({ title: version.label, message: version.resumeText })} />
                    {(['pdf', 'docx', 'txt'] as const).map((format) => (
                      <Button
                        key={format}
                        label={format.toUpperCase()}
                        variant="secondary"
                        loading={exportVersion.isPending && exportVersion.variables?.format === format}
                        disabled={exportVersion.isPending}
                        onPress={() =>
                          exportVersion.mutate(
                            { id: version.id, format },
                            { onError: (e) => Alert.alert('Export failed', e instanceof ApiError ? e.message : 'Please try again.') },
                          )
                        }
                      />
                    ))}
                    <Button label="Regenerate" variant="ghost" onPress={() => generate(true)} loading={tailoring.isRunning} />
                  </View>
                </Section>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  section: { gap: Spacing.two },
  jobTitle: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  resumeList: { gap: Spacing.two },
  resumeOption: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.three, gap: Spacing.half },
  steps: { gap: Spacing.one },
  banner: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.three, backgroundColor: 'transparent' },
  input: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  multiline: { minHeight: 160 },
  changeCard: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.three, gap: Spacing.one },
  changeHead: { flexDirection: 'row', justifyContent: 'space-between' },
});