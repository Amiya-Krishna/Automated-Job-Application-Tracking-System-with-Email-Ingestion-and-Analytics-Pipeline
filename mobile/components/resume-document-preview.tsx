import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SECTION_HEADINGS = new Set([
  'summary',
  'professional summary',
  'objective',
  'experience',
  'work experience',
  'professional experience',
  'education',
  'skills',
  'technical skills',
  'projects',
  'certifications',
  'certificates',
  'achievements',
  'awards',
  'publications',
  'research',
  'internships',
  'internship',
  'languages',
  'interests',
  'leadership',
  'volunteer experience',
  'coursework',
  'profile',
]);

const normalize = (value: string) => value.trim().replace(/[\s:]+$/, '').toLowerCase();
const isContact = (line: string) => /@|https?:\/\/|linkedin|github|\+?\d[\d\s().-]{7,}/i.test(line);
const isDateLine = (line: string) => /\b(19|20)\d{2}\b/.test(line) && /[-–—]|to|present|current/i.test(line);
const isBullet = (line: string) => /^(?:[•●▪◦‣]|[-*])\s+/.test(line.trim());
const isHeading = (line: string) => {
  const clean = normalize(line);
  if (!clean || clean.length > 55) return false;
  if (SECTION_HEADINGS.has(clean)) return true;
  return /^[A-Z0-9][A-Z0-9 &/|.'-]{2,54}$/.test(line.trim()) && !isDateLine(line);
};

export function ResumeDocumentPreview({ text, name }: { text: string; name?: string }) {
  const theme = useTheme();
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const nonEmpty = lines.filter((line) => line.trim()).length;

  if (!text.trim()) {
    return (
      <ThemedView type="backgroundElement" style={[styles.empty, { borderColor: theme.border }]}>
        <ThemedText type="small" themeColor="textSecondary">
          No parsed resume text is available yet.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={[styles.document, { borderColor: theme.border }]}>
      <View style={[styles.paperHeader, { borderBottomColor: theme.border }]}>
        <View style={styles.flex}>
          <ThemedText type="headline" numberOfLines={2}>
            {name || 'Resume'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Full parsed preview · {nonEmpty} content lines
          </ThemedText>
        </View>
        <View style={[styles.previewBadge, { backgroundColor: `${theme.tint}16` }]}>
          <ThemedText type="smallBold" themeColor="tint">FULL</ThemedText>
        </View>
      </View>

      <View style={styles.body}>
        {lines.map((line, index) => {
          const trimmed = line.trim();
          if (!trimmed) return <View key={`blank-${index}`} style={styles.blankLine} />;

          if (isHeading(trimmed)) {
            return (
              <View key={`line-${index}`} style={[styles.section, { borderBottomColor: theme.border }]}>
                <ThemedText type="smallBold" themeColor="tint" style={styles.sectionText}>
                  {trimmed}
                </ThemedText>
              </View>
            );
          }

          if (isContact(trimmed)) {
            return (
              <ThemedText key={`line-${index}`} type="small" themeColor="textSecondary" style={styles.contact}>
                {trimmed}
              </ThemedText>
            );
          }

          if (isBullet(trimmed)) {
            const bullet = trimmed.replace(/^(?:[•●▪◦‣]|[-*])\s+/, '');
            return (
              <View key={`line-${index}`} style={styles.bulletRow}>
                <ThemedText type="smallBold" themeColor="tint" style={styles.bullet}>
                  •
                </ThemedText>
                <ThemedText type="small" style={styles.flex}>
                  {bullet}
                </ThemedText>
              </View>
            );
          }

          if (isDateLine(trimmed)) {
            return (
              <ThemedText key={`line-${index}`} type="small" themeColor="textSecondary" style={styles.date}>
                {trimmed}
              </ThemedText>
            );
          }

          return (
            <ThemedText key={`line-${index}`} type="small" style={styles.paragraph}>
              {trimmed}
            </ThemedText>
          );
        })}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  document: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  paperHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
  },
  section: {
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
    paddingBottom: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionText: {
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  paragraph: {
    lineHeight: 21,
    marginBottom: 5,
  },
  contact: {
    lineHeight: 19,
    marginBottom: 4,
  },
  date: {
    lineHeight: 19,
    marginTop: 2,
    marginBottom: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    marginBottom: 6,
  },
  bullet: {
    width: 10,
    lineHeight: 21,
  },
  blankLine: {
    height: 7,
  },
  previewBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  flex: {
    flex: 1,
  },
  empty: {
    borderWidth: 1,
    borderRadius: 18,
    padding: Spacing.three,
  },
});
