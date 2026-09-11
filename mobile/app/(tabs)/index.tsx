import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

// Placeholder authenticated Home screen for the authentication phase
// only. The real dashboard (metrics, recent applications, etc.) is
// built in a later step — this exists so login/logout can actually be
// exercised end-to-end right now.
export default function HomeScreen() {
  const { user, logout } = useAuth();
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          {user ? `Hi, ${user.name.split(' ')[0]}` : 'Signed in'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          Authentication is wired up. The dashboard comes next.
        </ThemedText>

        <Pressable
          accessibilityRole="button"
          onPress={() => logout()}
          style={[styles.logoutButton, { borderColor: theme.border }]}>
          <ThemedText type="smallBold" themeColor="danger">
            Log out
          </ThemedText>
        </Pressable>
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  logoutButton: {
    marginTop: Spacing.four,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
