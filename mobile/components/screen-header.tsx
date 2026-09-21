/**
 * Lightweight top bar used by the tab screens that don't need the rich
 * Dashboard header (Jobs, Analytics, Notifications, Profile, and the
 * drawer-only static screens) — replaces each one's old bare
 * `<ThemedText type="title">Jobs</ThemedText>` line with a hamburger
 * button that opens the drawer (app/(drawer)/_layout.tsx), plus room for
 * one right-aligned action.
 */
import { DrawerActions } from 'expo-router/react-navigation';
import { useNavigation } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ScreenHeaderProps {
  title: string;
  right?: ReactNode;
}

export function ScreenHeader({ title, right }: ScreenHeaderProps) {
  const navigation = useNavigation();
  const theme = useTheme();

  return (
    <View style={styles.container}>
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
      <ThemedText type="title" style={styles.title} numberOfLines={1}>
        {title}
      </ThemedText>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 4,
  },
  hamburgerLine: {
    width: 20,
    height: 2,
    borderRadius: 1,
  },
  hamburgerLineShort: {
    width: 14,
  },
  title: {
    flex: 1,
    fontSize: 28,
    lineHeight: 34,
  },
  right: {
    minWidth: 24,
    alignItems: 'flex-end',
  },
});
