import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

interface StatCardProps { label: string; value: string | number; }

const accents: Record<string, [string, string]> = {
  'Total Applications': ['#2563EB', '#DBEAFE'],
  Interviews: ['#7C3AED', '#EDE9FE'],
  Offers: ['#059669', '#D1FAE5'],
  Rejections: ['#E11D48', '#FFE4E6'],
};

export function StatCard({ label, value }: StatCardProps) {
  const theme = useTheme();
  const [accent, soft] = accents[label] ?? [theme.tint, theme.backgroundSelected];
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={[styles.dot, { backgroundColor: soft }]}>
        <View style={[styles.dotInner, { backgroundColor: accent }]} />
      </View>
      <ThemedText type="display" style={[styles.value, { color: accent }]} importantForAccessibility="no">{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" importantForAccessibility="no">{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexBasis: '47%', flexGrow: 1, borderRadius: 22, padding: 17, gap: 5,
    borderWidth: StyleSheet.hairlineWidth, minHeight: 132,
    ...Platform.select({ ios: { shadowColor:'#101828', shadowOffset:{width:0,height:8}, shadowOpacity:0.07, shadowRadius:18 }, android:{ elevation:3 }, default:{} }),
  },
  dot: { width: 30, height: 30, borderRadius: 10, alignItems:'center', justifyContent:'center', marginBottom: 4 },
  dotInner: { width: 10, height: 10, borderRadius: 5 },
  value: { fontSize: 30, lineHeight: 36 },
});
