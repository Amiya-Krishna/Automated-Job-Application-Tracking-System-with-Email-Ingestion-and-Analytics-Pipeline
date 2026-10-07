import { DrawerActions } from 'expo-router/react-navigation';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { router, type Href } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ChevronRightIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';

interface MenuItem {
  label: string;
  hint?: string;
  icon: string;
  href: Href;
  tone: string;
}

// Primary destinations also live in the bottom tabs (Home, Jobs, Tracker, Alerts, Profile); they are
// repeated here only because drawer-level screens (Analytics, Saved Jobs ...) have no tab bar.
const WORKSPACE: MenuItem[] = [
  { label: 'Dashboard', icon: '⌂', href: '/', tone: '#4F46E5' },
  { label: 'Jobs', icon: '◈', href: '/jobs', tone: '#2563EB' },
  { label: 'Job Tracker', icon: '▣', href: '/applications', tone: '#0891B2' },
  { label: 'Analytics', icon: '◒', href: '/analytics', tone: '#059669' },
  { label: 'Saved Jobs', icon: '★', href: '/saved-jobs', tone: '#CA8A04' },
  { label: 'Notifications', icon: '◌', href: '/notifications', tone: '#DB2777' },
  { label: 'Profile', icon: '◉', href: '/profile', tone: '#EA580C' },
];

const RESUME: MenuItem[] = [
  { label: 'My resumes', hint: 'Upload and manage', icon: '↑', href: '/resumes', tone: '#2563EB' },
  { label: 'ATS score & tailoring', hint: 'Match a job description', icon: '✦', href: '/tailor', tone: '#7C3AED' },
  { label: 'Resume insights', hint: 'Skills and gaps', icon: '◆', href: '/resume-insights', tone: '#9333EA' },
];

// Admin-only: rendered only for a server-verified admin (user.role comes from /auth/login and /auth/me).
const SOURCES_ITEM: MenuItem = { label: 'Sources', hint: 'Where your jobs come from', icon: '⛁', href: '/sources', tone: '#0EA5E9' };
const ADMIN_SOURCES_ITEM: MenuItem = { label: 'Sources & discovery', hint: 'Fetched job boards', icon: '⛨', href: '/sources', tone: '#E11D48' };
const ADMIN: MenuItem[] = [ADMIN_SOURCES_ITEM];

export function DrawerContent({ navigation }: DrawerContentComponentProps) {
  const theme = useTheme();
  const { user, logout, isAdmin } = useAuth();
  const profile = useProfile();
  const displayName = profile.data?.full_name || user?.name || 'Your account';
  const displayEmail = profile.data?.email || user?.email || null;

  const go = (href: Href) => {
    // Analytics is a drawer screen: navigate through the router (keeps expo-router state in sync,
    // unlike navigation.navigate) after closing the drawer, same as every other item.
    if (href === '/analytics') {
      navigation.dispatch(DrawerActions.closeDrawer());
      router.navigate(href);
      return;
    }

    navigation.dispatch(DrawerActions.closeDrawer());
    router.push(href);
  };
  const handleLogout = () => {
    navigation.dispatch(DrawerActions.closeDrawer());
    Alert.alert('Log out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const renderItem = (item: MenuItem) => (
    <Pressable
      key={item.label}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      onPress={() => go(item.href)}
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: theme.backgroundSelected }]}>
      <View style={[styles.itemIcon, { backgroundColor: `${item.tone}1F` }]}>
        <ThemedText style={[styles.itemGlyph, { color: item.tone }]}>{item.icon}</ThemedText>
      </View>
      <View style={styles.itemCopy}>
        <ThemedText type="smallBold">{item.label}</ThemedText>
        {item.hint ? (
          <ThemedText type="caption" themeColor="textSecondary">
            {item.hint}
          </ThemedText>
        ) : null}
      </View>
      <ChevronRightIcon color={theme.textSecondary} size={16} />
    </Pressable>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={() => go('/profile')}
            style={[styles.profile, { backgroundColor: theme.tint }]}>
            <Avatar name={displayName} size={52} />
            <View style={styles.profileCopy}>
              <ThemedText type="headline" numberOfLines={1} style={styles.white}>
                {displayName}
              </ThemedText>
              {displayEmail ? (
                <ThemedText type="caption" numberOfLines={1} style={styles.mutedWhite}>
                  {displayEmail}
                </ThemedText>
              ) : null}
              {isAdmin ? (
                <View style={styles.adminPill}>
                  <ThemedText type="caption" style={styles.adminPillText}>
                    ADMIN
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </Pressable>

          <Section label="Workspace">{(isAdmin ? WORKSPACE : [...WORKSPACE, SOURCES_ITEM]).map(renderItem)}</Section>
          <Section label="Resume studio">{RESUME.map(renderItem)}</Section>
          {isAdmin ? <Section label="Admin">{ADMIN.map(renderItem)}</Section> : null}

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <Pressable accessibilityRole="button" onPress={() => go('/account/settings')} style={styles.plainRow}>
            <ThemedText type="smallBold">Settings</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => go('/help')} style={styles.plainRow}>
            <ThemedText type="smallBold">Help</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => go('/about')} style={styles.plainRow}>
            <ThemedText type="smallBold">About</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={handleLogout} style={styles.plainRow}>
            <ThemedText type="smallBold" themeColor="danger">
              Log out
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="overline" themeColor="textSecondary" style={styles.sectionLabel}>
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: 16, gap: 18, paddingBottom: 28 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: Radius.xl, minHeight: 88 },
  profileCopy: { flex: 1, gap: 2, minWidth: 0 },
  white: { color: '#fff' },
  mutedWhite: { color: 'rgba(255,255,255,0.8)' },
  adminPill: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill, backgroundColor: 'rgba(255,255,255,0.22)' },
  adminPillText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  section: { gap: 2 },
  sectionLabel: { marginLeft: 8, marginBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 8, borderRadius: Radius.md, minHeight: 52 },
  itemIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemGlyph: { fontSize: 17, fontWeight: '800' },
  itemCopy: { flex: 1, minWidth: 0 },
  divider: { height: StyleSheet.hairlineWidth * 2, marginVertical: 4 },
  plainRow: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 },
});
