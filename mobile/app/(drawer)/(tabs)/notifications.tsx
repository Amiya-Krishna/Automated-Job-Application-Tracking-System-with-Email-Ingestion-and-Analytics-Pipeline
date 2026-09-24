import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { NotificationItem } from '@/components/notification-item';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useNotifications } from '@/hooks/use-notifications';
import type { AppNotification } from '@/types/notifications';

export default function NotificationsScreen() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, remove } = useNotifications();

  // Tap = mark read + go to the relevant screen. A target is just an Expo
  // Router pathname/params pair (see types/notifications.ts), so this is
  // the same router the rest of the app already uses — no second
  // navigation system. An unknown/missing/malformed target, or a route
  // that no longer resolves (e.g. the application was since deleted),
  // never crashes the app: it's simply not navigated, and the user is
  // left on this list, which is always a safe place to be.
  const openNotification = (item: AppNotification) => {
    markAsRead(item.id);
    if (!item.target?.pathname) return;
    try {
      router.push({ pathname: item.target.pathname as never, params: item.target.params });
    } catch {
      // Fall back to staying on the Notifications list rather than crashing.
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title="Notifications"
          right={
            unreadCount > 0 ? (
              <Pressable accessibilityRole="button" onPress={markAllAsRead} hitSlop={Spacing.two}>
                <ThemedText type="small" themeColor="tint">
                  Mark all read
                </ThemedText>
              </Pressable>
            ) : null
          }
        />

        {unreadCount > 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
            {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}
          </ThemedText>
        ) : null}

        <FlatList<AppNotification>
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotificationItem
              notification={item}
              onPress={() => openNotification(item)}
              onDelete={() => remove(item.id)}
            />
          )}
          ItemSeparatorComponent={() => <ThemedView style={{ height: Spacing.two }} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              title="You're all caught up"
              subtitle="Interview reminders, application updates, and resume changes will show up here."
            />
          }
        />
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
    gap: Spacing.three,
  },
  subtitle: {
    paddingHorizontal: Spacing.four,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
});
