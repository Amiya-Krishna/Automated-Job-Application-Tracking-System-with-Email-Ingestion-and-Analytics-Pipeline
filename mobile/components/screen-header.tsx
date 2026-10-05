import { DrawerActions } from 'expo-router/react-navigation';
import { router, useNavigation } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BellIcon, MenuIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Layout, Radius } from '@/constants/theme';
import { useNotifications } from '@/hooks/use-notifications';
import { useTheme } from '@/hooks/use-theme';

interface ScreenHeaderProps {
  title: string;
  /** One short line under the title (what this screen is for). */
  subtitle?: string;
  /** Replaces the default notification bell. */
  right?: ReactNode;
  /** Hide the bell (e.g. on the Alerts tab itself). */
  hideBell?: boolean;
}

/**
 * Top bar for every tab: menu (opens the drawer) on the left, title in the middle and the
 * notification bell - with its unread badge - on the right, so alerts are one tap from
 * anywhere. All three are 44pt targets.
 */
export function ScreenHeader({ title, subtitle, right, hideBell }: ScreenHeaderProps) {
  const navigation = useNavigation();
  const theme = useTheme();
  const { unreadCount } = useNotifications();

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open menu"
        hitSlop={6}
        onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        style={({ pressed }) => [styles.iconButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, pressed && styles.pressed]}>
        <MenuIcon color={theme.text} />
      </Pressable>

      <View style={styles.titleBlock}>
        <ThemedText type="subtitle" numberOfLines={1} accessibilityRole="header">
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>

      {right ??
        (hideBell ? (
          <View style={styles.iconSpacer} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            hitSlop={6}
            onPress={() => router.navigate('/notifications')}
            style={({ pressed }) => [styles.iconButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, pressed && styles.pressed]}>
            <BellIcon color={theme.text} />
            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <ThemedText type="caption" style={styles.badgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </ThemedText>
              </View>
            ) : null}
          </Pressable>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Layout.gutter, paddingVertical: 8, minHeight: 60 },
  iconButton: { width: 44, height: 44, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth * 2, alignItems: 'center', justifyContent: 'center' },
  iconSpacer: { width: 44, height: 44 },
  titleBlock: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: '#F43F5E', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 10, lineHeight: 12, fontWeight: '800' },
});
