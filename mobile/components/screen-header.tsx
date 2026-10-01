import { DrawerActions } from 'expo-router/react-navigation';
import { useNavigation } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ScreenHeaderProps { title: string; right?: ReactNode; }

export function ScreenHeader({ title, right }: ScreenHeaderProps) {
  const navigation = useNavigation();
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open menu" hitSlop={Spacing.two} onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={({pressed}) => [styles.menuButton, {backgroundColor:theme.backgroundElement,borderColor:theme.border}, pressed && styles.pressed]}>
        <View style={[styles.hamburgerLine, { backgroundColor: theme.tint }]} />
        <View style={[styles.hamburgerLine, { backgroundColor: theme.tint }]} />
        <View style={[styles.hamburgerLine, styles.hamburgerLineShort, { backgroundColor: theme.tint }]} />
      </Pressable>
      <View style={styles.titleBlock}><ThemedText type="title" style={styles.title} numberOfLines={1}>{title}</ThemedText><View style={[styles.accent, {backgroundColor:theme.pink}]} /></View>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:20,paddingVertical:8},
  menuButton:{width:44,height:44,borderRadius:14,borderWidth:StyleSheet.hairlineWidth,alignItems:'flex-start',justifyContent:'center',gap:4,paddingLeft:12},
  hamburgerLine:{width:17,height:2,borderRadius:1}, hamburgerLineShort:{width:11},
  titleBlock:{flex:1,gap:2}, title:{fontSize:25,lineHeight:31}, accent:{width:26,height:3,borderRadius:3}, right:{minWidth:28,alignItems:'flex-end'}, pressed:{transform:[{scale:0.96}],opacity:0.8},
});
