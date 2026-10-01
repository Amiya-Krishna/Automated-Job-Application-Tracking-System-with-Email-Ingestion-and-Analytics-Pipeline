import { Platform, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

interface StatCardProps { label: string; value: string | number; }

export function StatCard({ label, value }: StatCardProps) {
  return (
    <ThemedView type="backgroundElement" style={styles.card} accessible accessibilityLabel={`${label}: ${value}`}>
      <ThemedText type="display" style={styles.value} importantForAccessibility="no">{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" importantForAccessibility="no">{label}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { flexBasis: '47%', flexGrow: 1, borderRadius: 20, padding: 18, gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E7EAF0', ...Platform.select({ios:{shadowColor:'#101828',shadowOffset:{width:0,height:6},shadowOpacity:0.06,shadowRadius:14},android:{elevation:2},default:{}}) },
  value: { fontSize: 30, lineHeight: 36 },
});
