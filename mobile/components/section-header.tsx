import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export function SectionHeader({ title, actionLabel, onActionPress }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <ThemedText type="headline" accessibilityRole="header">
        {title}
      </ThemedText>
      {actionLabel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}: ${title}`}
          onPress={onActionPress}
          hitSlop={Spacing.two}
          style={styles.action}>
          <ThemedText type="smallBold" themeColor="tint">
            {actionLabel}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  action: { minHeight: 48, minWidth: 48, alignItems: 'flex-end', justifyContent: 'center' },
});
