import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function AboutScreen() {
  const theme = useTheme();
  const appVersion = Constants.expoConfig?.version ?? null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="About" />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Card style={styles.card}>
            <ThemedText type="smallBold">TrackTrail</ThemedText>
            {appVersion ? (
              <ThemedText type="small" themeColor="textSecondary">
                Version {appVersion}
              </ThemedText>
            ) : null}
            <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
              TrackTrail helps you track job applications, discover and match against new
              openings, sync interview and offer emails from Gmail, and see your job-search
              analytics in one place.
            </ThemedText>
          </Card>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/legal/privacy')}
            style={[styles.row, { borderColor: theme.border }]}>
            <ThemedText type="default">Privacy Policy</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              ›
            </ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/legal/terms')}
            style={[styles.row, { borderColor: theme.border }]}>
            <ThemedText type="default">Terms of Service</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              ›
            </ThemedText>
          </Pressable>
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
  description: {
    marginTop: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
  },
});
