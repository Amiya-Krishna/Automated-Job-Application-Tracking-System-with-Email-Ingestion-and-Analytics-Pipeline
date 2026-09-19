/**
 * Circular initials avatar. No avatar-upload endpoint exists on the
 * backend (Profile has no photo/avatar_url field — see types/profile.ts,
 * which matches the Prisma model exactly), so this renders the user's
 * initials on a tinted background rather than an <Image>, the same
 * approach GitHub/Slack/Linear fall back to before a real photo exists.
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

interface AvatarProps {
  name: string | null | undefined;
  size?: number;
}

export function Avatar({ name, size = 44 }: AvatarProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.tint },
      ]}>
      <ThemedText type="smallBold" style={{ color: '#ffffff', fontSize: size * 0.4 }}>
        {getInitials(name)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
