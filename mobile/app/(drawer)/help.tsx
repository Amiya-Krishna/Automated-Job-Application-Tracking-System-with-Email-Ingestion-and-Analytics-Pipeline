/**
 * Static FAQ describing what the app actually does today — Gmail sync,
 * the automated apply engine, job matching, and manual tracking — kept
 * honest to server/routes/* rather than describing aspirational
 * features. Update the copy below as real functionality changes.
 */
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

const FAQS = [
  {
    question: 'How does job matching work?',
    answer:
      'Every job pulled in by the discovery pipeline is scored against your profile — mainly your resume text and skills — using a text-similarity model. Higher match percentages mean closer overlap with what you\u2019ve told the app about yourself.',
  },
  {
    question: 'What does connecting Gmail do?',
    answer:
      'With read-only access, the app can scan your inbox for interview invites, offers, and rejections and offer to add them to your pipeline. Email content is never stored — only what you choose to add.',
  },
  {
    question: 'What is the apply engine / Engine Applications queue?',
    answer:
      'For jobs the automated pipeline applies to on your behalf, the Engine Applications screen shows the raw queue and its outcomes — separate from your manually tracked applications.',
  },
  {
    question: 'How do I improve my match scores?',
    answer:
      'Keep your resume text, skills, and experience up to date in Edit Profile — see Resume Insights in the menu for a checklist of what\u2019s missing.',
  },
  {
    question: 'Can I change my password?',
    answer:
      'From Settings → Change Password, we\u2019ll send a password-reset link to your account email — the same flow as "Forgot password" on the login screen.',
  },
];

export default function HelpScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Help" />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {FAQS.map((faq) => (
            <Card key={faq.question} style={styles.card}>
              <ThemedText type="smallBold">{faq.question}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {faq.answer}
              </ThemedText>
            </Card>
          ))}
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
    gap: Spacing.two,
  },
  card: {
    gap: Spacing.one,
  },
});
