/**
 * The Dashboard's rich top section: hamburger (opens the drawer), avatar,
 * time-of-day greeting, search bar, and a notification bell with an
 * unread badge. Every other tab uses the plainer ScreenHeader instead —
 * this one is deliberately special since Home is the app's front door.
 */
import { DrawerActions } from 'expo-router/react-navigation';
import { router, useNavigation } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { BellIcon } from '@/components/icons';
import { SearchBar } from '@/components/search-bar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useNotifications } from '@/hooks/use-notifications';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

interface DashboardHeaderProps {
  name: string | null | undefined;
}

export function DashboardHeader({ name }: DashboardHeaderProps) {
  const theme = useTheme();
  const navigation = useNavigation();
  const { unreadCount } = useNotifications();
  const [query, setQuery] = useState('');

  const firstName = name?.split(' ')[0];

  const submitSearch = () => {
    if (!query.trim()) return;
    router.push({ pathname: '/jobs', params: { q: query.trim() } });
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          hitSlop={Spacing.two}
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          style={styles.menuButton}>
          <View style={[styles.hamburgerLine, { backgroundColor: theme.text }]} />
          <View style={[styles.hamburgerLine, { backgroundColor: theme.text }]} />
          <View style={[styles.hamburgerLine, styles.hamburgerLineShort, { backgroundColor: theme.text }]} />
        </Pressable>

        <Avatar name={name} size={40} />

        <View style={styles.greetingBlock}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {getGreeting()}{firstName ? `, ${firstName}` : ''}
          </ThemedText>
          <ThemedText type="headline" numberOfLines={1} accessibilityRole="header">
            Let&apos;s find your next role
          </ThemedText>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          hitSlop={Spacing.two}
          onPress={() => router.navigate('/notifications')}
          style={styles.bellButton}>
          <BellIcon color={theme.text} />
          {unreadCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.danger }]}>
              <ThemedText type="caption" style={styles.badgeText} maxFontSizeMultiplier={1}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </ThemedText>
            </View>
          ) : null}
        </Pressable>
      </View>

      <SearchBar
        value={query}
        onChangeText={setQuery}
        onSubmit={submitSearch}
        placeholder="Search jobs, companies, locations…"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  menuButton: {
    width: 46,
    height: 46,
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 4,
  },
  hamburgerLine: {
    width: 18,
    height: 2,
    borderRadius: 1,
  },
  hamburgerLineShort: {
    width: 12,
  },
  greetingBlock: {
    flex: 1,
    gap: 3,
  },
  bellButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellIcon: {
    fontSize: 22,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
  },
});
