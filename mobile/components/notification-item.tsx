import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AppNotification, NotificationKind } from '@/types/notifications';

const KIND_ICON: Record<NotificationKind, string> = {
  interview: '📅',
  application: '📨',
  resume: '📄',
  system: '🔔',
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface NotificationItemProps {
  notification: AppNotification;
  onPress?: () => void;
  onDelete?: () => void;
}

export function NotificationItem({ notification, onPress, onDelete }: NotificationItemProps) {
  const theme = useTheme();

  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card
        variant="flat"
        style={[styles.card, !notification.read && { borderColor: theme.tint, borderWidth: 1 }]}>
        <View style={styles.row}>
          <ThemedText style={styles.icon}>{KIND_ICON[notification.kind]}</ThemedText>
          <View style={styles.body}>
            <View style={styles.titleRow}>
              <ThemedText type="smallBold" style={styles.title} numberOfLines={1}>
                {notification.title}
              </ThemedText>
              {!notification.read ? <View style={[styles.dot, { backgroundColor: theme.tint }]} /> : null}
            </View>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {notification.body}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.timestamp}>
              {timeAgo(notification.createdAt)}
            </ThemedText>
          </View>
          {onDelete ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Delete notification" onPress={onDelete} hitSlop={8}>
              <ThemedText type="small" themeColor="textSecondary">
                ✕
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  icon: {
    fontSize: 22,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  title: {
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timestamp: {
    marginTop: 2,
  },
});
