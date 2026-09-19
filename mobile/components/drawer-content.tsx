/**
 * Custom hamburger-menu content for the Drawer navigator
 * (app/(drawer)/_layout.tsx). Built as a plain component rather than
 * relying on @react-navigation/drawer's auto-generated screen list,
 * because most of these items point at routes that aren't Drawer
 * screens themselves (they're nested tab screens, or top-level Stack
 * screens like /account/settings) — a manual list with router.push
 * calls handles both cases uniformly.
 */
import { DrawerActions } from '@react-navigation/native';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { router, type Href } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';

interface MenuItem {
  label: string;
  icon: string;
  href?: Href;
  danger?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  { label: 'Dashboard', icon: '🏠', href: '/' },
  { label: 'Job Tracker', icon: '🗂️', href: '/applications' },
  { label: 'Analytics', icon: '📊', href: '/analytics' },
  { label: 'Resume Insights', icon: '📄', href: '/resume-insights' },
  { label: 'Saved Jobs', icon: '⭐', href: '/saved-jobs' },
  { label: 'Notifications', icon: '🔔', href: '/notifications' },
  { label: 'Profile', icon: '👤', href: '/profile' },
  { label: 'Settings', icon: '⚙️', href: '/account/settings' },
  { label: 'Help', icon: '❓', href: '/help' },
  { label: 'About', icon: 'ℹ️', href: '/about' },
];

export function DrawerContent({ navigation }: DrawerContentComponentProps) {
  const theme = useTheme();
  const { user, logout } = useAuth();
  const profile = useProfile();

  const displayName = profile.data?.full_name || user?.name || 'Your account';
  const displayEmail = profile.data?.email || user?.email || null;

  const go = (href: Href) => {
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.header, { borderColor: theme.border }]}>
          <Avatar name={displayName} size={56} />
          <ThemedText type="smallBold" numberOfLines={1} style={styles.name}>
            {displayName}
          </ThemedText>
          {displayEmail ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {displayEmail}
            </ThemedText>
          ) : null}
        </View>

        <View style={styles.menu}>
          {MENU_ITEMS.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              onPress={() => item.href && go(item.href)}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && { backgroundColor: theme.backgroundElement },
              ]}>
              <ThemedText style={styles.menuIcon}>{item.icon}</ThemedText>
              <ThemedText type="default">{item.label}</ThemedText>
            </Pressable>
          ))}

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <Pressable
            accessibilityRole="button"
            onPress={handleLogout}
            style={({ pressed }) => [
              styles.menuItem,
              pressed && { backgroundColor: theme.backgroundElement },
            ]}>
            <ThemedText style={styles.menuIcon}>🚪</ThemedText>
            <ThemedText type="default" themeColor="danger">
              Logout
            </ThemedText>
          </Pressable>
        </View>
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
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    marginBottom: Spacing.two,
    borderBottomWidth: 1,
    gap: Spacing.one,
  },
  name: {
    marginTop: Spacing.two,
  },
  menu: {
    paddingHorizontal: Spacing.two,
    gap: Spacing.half,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 48,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
  },
  menuIcon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.two,
    marginHorizontal: Spacing.two,
  },
});
