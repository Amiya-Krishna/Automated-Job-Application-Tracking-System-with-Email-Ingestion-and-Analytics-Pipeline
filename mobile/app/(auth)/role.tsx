import { Link, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChevronRightIcon, ShieldIcon, UserIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Layout, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const ROLES = [
  { role: 'user', title: 'User', text: 'Track applications, match jobs, tailor your resume and get reminders.', Icon: UserIcon },
  { role: 'admin', title: 'Admin', text: 'Manage job sources and discovery. Requires an administrator account.', Icon: ShieldIcon },
] as const;

/** Step 0 of sign-in: choose the User or Admin door. The server still verifies the real role. */
export default function ChooseRoleScreen() {
  const theme = useTheme();
  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <ThemedText type="title">Sign in</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Choose how you want to sign in.
            </ThemedText>
          </View>

          <View style={styles.cards} accessibilityRole="radiogroup">
            {ROLES.map(({ role, title, text, Icon }) => (
              <Pressable
                key={role}
                accessibilityRole="button"
                accessibilityLabel={`Continue as ${title}`}
                onPress={() => router.push({ pathname: '/login', params: { role } })}
                style={({ pressed }) => [styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, pressed && styles.pressed]}>
                <View style={[styles.iconWrap, { backgroundColor: role === 'admin' ? '#FFE4E6' : theme.backgroundSelected }]}>
                  <Icon color={role === 'admin' ? '#E11D48' : theme.tint} size={26} />
                </View>
                <View style={styles.copy}>
                  <ThemedText type="headline">{title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {text}
                  </ThemedText>
                </View>
                <ChevronRightIcon color={theme.textSecondary} />
              </Pressable>
            ))}
          </View>

          <View style={styles.footer}>
            <ThemedText type="small" themeColor="textSecondary">
              New here?{' '}
            </ThemedText>
            <Link href="/register">
              <ThemedText type="smallBold" themeColor="tint">
                Create a user account
              </ThemedText>
            </Link>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Layout.gutter, paddingVertical: 32, gap: 28 },
  header: { gap: 6 },
  cards: { gap: 14 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, minHeight: 96, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth * 2 },
  iconWrap: { width: 52, height: 52, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 2 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
});
