import { Redirect, router } from 'expo-router';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

/** Public product page. The authenticated home remains the existing drawer/tab dashboard. */
export default function PublicHomeScreen() {
  const { status } = useAuth();
  const theme = useTheme();

  if (status === 'authenticated') return <Redirect href="/(drawer)/(tabs)" />;

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.brandRow}>
            <View style={[styles.mark, { backgroundColor: theme.tint }]}><ThemedText type="smallBold" style={styles.markText}>TT</ThemedText></View>
            <ThemedText type="subtitle">TrackTrail</ThemedText>
          </View>

          <View style={[styles.hero, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText type="title" style={styles.heroTitle}>A clearer path to your next role.</ThemedText>
            <ThemedText type="subtitle" themeColor="textSecondary" style={styles.heroCopy}>
              Track applications, tailor truthful resumes, and turn a scattered search into a confident weekly plan.
            </ThemedText>
            <Pressable accessibilityRole="button" style={[styles.primary, { backgroundColor: theme.tint }]} onPress={() => router.push('/(auth)/register')}>
              <ThemedText type="smallBold" style={styles.primaryText}>Create your free workspace</ThemedText>
            </Pressable>
            <Pressable accessibilityRole="button" style={[styles.secondary, { borderColor: theme.border }]} onPress={() => router.push('/(auth)/login')}>
              <ThemedText type="smallBold" style={{ color: theme.text }}>Log in</ThemedText>
            </Pressable>
          </View>

          <View style={styles.proofRow}>
            {[['One source of truth', 'Jobs, notes, interviews and follow-ups in one calm workspace.'], ['Evidence-first tailoring', 'Match roles without inventing skills or changing your original facts.'], ['See the signal', 'Spot pipeline gaps and focus your next best action.']].map(([title, body], index) => (
              <View key={title} style={[styles.proof, { borderColor: theme.border }]}>
                <View style={[styles.number, { backgroundColor: theme.tint }]}><ThemedText type="smallBold" style={styles.numberText}>0{index + 1}</ThemedText></View>
                <ThemedText type="smallBold">{title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{body}</ThemedText>
              </View>
            ))}
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.footer}>Already have an account? <ThemedText type="smallBold" style={{ color: theme.tint }} onPress={() => router.push('/(auth)/login')}>Log in</ThemedText></ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 }, safe: { flex: 1 }, content: { flexGrow: 1, padding: Spacing.four, gap: Spacing.four, justifyContent: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two }, mark: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, markText: { color: '#fff' },
  hero: { borderWidth: 1, borderRadius: 28, padding: Spacing.four, gap: Spacing.three }, heroTitle: { fontSize: 34, lineHeight: 40, letterSpacing: -0.8 }, heroCopy: { lineHeight: 24 },
  primary: { minHeight: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: Spacing.one }, primaryText: { color: '#fff' }, secondary: { minHeight: 52, borderRadius: 16, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  proofRow: { gap: Spacing.two }, proof: { borderWidth: 1, borderRadius: 18, padding: Spacing.three, gap: Spacing.one }, number: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' }, numberText: { color: '#fff', fontSize: 11 }, footer: { textAlign: 'center', marginTop: Spacing.one },
});
