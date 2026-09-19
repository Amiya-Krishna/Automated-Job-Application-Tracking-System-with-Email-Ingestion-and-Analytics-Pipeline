/**
 * "Resume Insights" — a completeness/readiness view built entirely from
 * real profile fields (types/profile.ts), not a fabricated AI resume
 * score. There is no scoring endpoint or model on the backend (only
 * server/services/matchingService.js's tf-idf job-matching, which is a
 * different thing — see jobs matching, not a resume grade), so this
 * screen tells the user which of the fields that ACTUALLY feed job
 * matching (resume_text, skills, experience_years) are filled in, and
 * nothing it can't back up.
 */
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/hooks/use-profile';

interface ChecklistItem {
  label: string;
  done: boolean;
  hint: string;
}

export default function ResumeInsightsScreen() {
  const theme = useTheme();
  const profile = useProfile();

  if (profile.isLoading) return <LoadingState label="Loading your profile…" />;
  if (profile.isError) return <ErrorState error={profile.error} onRetry={profile.refetch} />;

  const data = profile.data;
  const checklist: ChecklistItem[] = [
    {
      label: 'Resume text added',
      done: Boolean(data?.resume_text && data.resume_text.trim().length > 0),
      hint: 'Paste your resume text in Edit Profile — it directly feeds the job-matching algorithm.',
    },
    {
      label: 'Skills listed',
      done: Boolean(data?.skills && data.skills.length > 0),
      hint: 'Add your key skills, comma-separated, so matched jobs weigh them correctly.',
    },
    {
      label: 'Years of experience set',
      done: data?.experience_years !== null && data?.experience_years !== undefined,
      hint: 'Set your experience level so seniority-based matches are more accurate.',
    },
    {
      label: 'Full name & email set',
      done: Boolean(data?.full_name && data?.email),
      hint: 'Fill in your name and email so applications and exports look complete.',
    },
  ];

  const completedCount = checklist.filter((item) => item.done).length;
  const completeness = Math.round((completedCount / checklist.length) * 100);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Resume Insights" />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Card variant="elevated" style={styles.scoreCard}>
            <ThemedText type="title" style={styles.scoreValue}>
              {completeness}%
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Profile completeness
            </ThemedText>
            <View style={[styles.track, { backgroundColor: theme.border }]}>
              <View style={[styles.trackFill, { width: `${completeness}%`, backgroundColor: theme.tint }]} />
            </View>
          </Card>

          <ThemedView style={styles.section}>
            <SectionHeader title="Checklist" />
            {checklist.map((item) => (
              <Card key={item.label} style={styles.checklistRow}>
                <View style={styles.checklistHeader}>
                  <View
                    style={[
                      styles.checkCircle,
                      { borderColor: item.done ? theme.tint : theme.border, backgroundColor: item.done ? theme.tint : 'transparent' },
                    ]}>
                    {item.done ? <ThemedText style={styles.checkMark}>✓</ThemedText> : null}
                  </View>
                  <ThemedText type="smallBold" style={styles.checklistLabel}>
                    {item.label}
                  </ThemedText>
                </View>
                {!item.done ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.checklistHint}>
                    {item.hint}
                  </ThemedText>
                ) : null}
              </Card>
            ))}
          </ThemedView>

          {data?.resume_text ? (
            <ThemedView style={styles.section}>
              <SectionHeader title="Resume preview" />
              <Card>
                <ThemedText type="small" numberOfLines={8}>
                  {data.resume_text}
                </ThemedText>
              </Card>
            </ThemedView>
          ) : (
            <EmptyState
              title="No resume text yet"
              subtitle="Add your resume text in Edit Profile to see a preview here and improve your job matches."
            />
          )}

          {data?.skills?.length ? (
            <ThemedView style={styles.section}>
              <SectionHeader title={`Skills (${data.skills.length})`} />
              <Card>
                <ThemedText type="small">{data.skills.join(', ')}</ThemedText>
              </Card>
            </ThemedView>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, gap: Spacing.three },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  scoreCard: {
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  scoreValue: {
    fontSize: 40,
    lineHeight: 44,
  },
  track: {
    alignSelf: 'stretch',
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: Spacing.one,
  },
  trackFill: {
    height: '100%',
    borderRadius: 999,
  },
  section: {
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  checklistRow: {
    gap: Spacing.one,
  },
  checklistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  checklistLabel: {
    flex: 1,
  },
  checklistHint: {
    marginLeft: 28,
  },
});
