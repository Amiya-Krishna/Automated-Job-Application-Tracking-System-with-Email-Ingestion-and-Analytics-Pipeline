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
      <View style={[styles.hero, { backgroundColor: theme.tint }]}>
        <View style={[styles.orb, styles.orbOne]} />
        <View style={[styles.orb, styles.orbTwo]} />
        <View style={styles.heroTop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            hitSlop={Spacing.two}
            onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
            style={styles.heroMenu}>
            <View style={styles.hamburgerLine} />
            <View style={styles.hamburgerLine} />
            <View style={[styles.hamburgerLine, styles.hamburgerLineShort]} />
          </Pressable>
          <View style={styles.heroCopy}>
            <ThemedText type="small" style={styles.heroEyebrow}>{getGreeting()}{firstName ? `, ${firstName}` : ''}</ThemedText>
            <ThemedText type="subtitle" style={styles.heroTitle}>Let&apos;s land your next role</ThemedText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            hitSlop={Spacing.two}
            onPress={() => router.navigate('/notifications')}
            style={styles.heroBell}>
            <BellIcon color="#fff" />
            {unreadCount > 0 ? <View style={styles.heroBadge}><ThemedText type="caption" style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</ThemedText></View> : null}
          </Pressable>
        </View>
        <Avatar name={name} size={46} />
        <ThemedText type="small" style={styles.heroSub}>Track applications, score resumes, and tailor faster.</ThemedText>
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
  container: { gap: 16 },
  hero: { borderRadius: 30, padding: 20, minHeight: 205, overflow: 'hidden', gap: 12 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroMenu: { width: 40, height: 40, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'flex-start', justifyContent: 'center', paddingLeft: 11, gap: 4 },
  heroCopy: { flex: 1, gap: 1 },
  heroEyebrow: { color: 'rgba(255,255,255,0.78)' },
  heroTitle: { color: '#fff', fontSize: 19, lineHeight: 26 },
  heroBell: { width: 40, height: 40, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.16)', alignItems:'center', justifyContent:'center' },
  heroBadge: { position:'absolute', top:2, right:2, minWidth:17, height:17, borderRadius:9, backgroundColor:'#F43F5E', alignItems:'center', justifyContent:'center' },
  badgeText: { color:'#fff', fontSize:9, lineHeight:11, fontWeight:'800' },
  orb: { position:'absolute', borderRadius:999, backgroundColor:'rgba(255,255,255,0.10)' },
  orbOne: { width:170, height:170, right:-70, top:-65 },
  orbTwo: { width:115, height:115, left:-45, bottom:-45, backgroundColor:'rgba(236,72,153,0.24)' },
  heroSub: { color:'rgba(255,255,255,0.82)', maxWidth:290 },
  hamburgerLine: { width:17, height:2, borderRadius:2, backgroundColor:'#fff' },
  hamburgerLineShort: { width:11 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
