import { DrawerActions } from 'expo-router/react-navigation';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { router, type Href } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ChevronRightIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';

interface MenuItem { label: string; subtitle?: string; icon: string; href?: Href; tone: string; soft: string; }

const MENU_ITEMS: MenuItem[] = [
  { label: 'Dashboard', icon: '⌂', href: '/', tone: '#4F46E5', soft: '#EEF2FF' },
  { label: 'Job Tracker', icon: '▣', href: '/applications', tone: '#2563EB', soft: '#DBEAFE' },
  { label: 'Analytics', icon: '◒', href: '/analytics', tone: '#059669', soft: '#D1FAE5' },
  { label: 'Notifications', icon: '◌', href: '/notifications', tone: '#DB2777', soft: '#FCE7F3' },
  { label: 'Profile', icon: '◉', href: '/profile', tone: '#EA580C', soft: '#FFEDD5' },
  { label: 'Saved Jobs', icon: '★', href: '/saved-jobs', tone: '#CA8A04', soft: '#FEF3C7' },
  { label: 'Resume Insights', icon: '◆', href: '/resume-insights', tone: '#7C3AED', soft: '#EDE9FE' },
];

export function DrawerContent({ navigation }: DrawerContentComponentProps) {
  const theme = useTheme();
  const { user, logout } = useAuth();
  const profile = useProfile();
  const displayName = profile.data?.full_name || user?.name || 'Your account';
  const displayEmail = profile.data?.email || user?.email || null;

  const go = (href: Href) => { navigation.dispatch(DrawerActions.closeDrawer()); router.push(href); };
  const handleLogout = () => {
    navigation.dispatch(DrawerActions.closeDrawer());
    Alert.alert('Log out?', undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: () => logout() }]);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={[styles.profileHero, { backgroundColor: theme.tint }]}>
            <View style={styles.heroOrb} />
            <View style={styles.profileTop}>
              <Avatar name={displayName} size={56} />
              <Pressable onPress={() => go('/account/settings')} style={styles.settingsButton}>
                <ThemedText style={styles.settingsIcon}>⚙</ThemedText>
              </Pressable>
            </View>
            <ThemedText type="subtitle" style={styles.white}>{displayName}</ThemedText>
            {displayEmail ? <ThemedText type="caption" style={styles.mutedWhite}>{displayEmail}</ThemedText> : null}
            <View style={styles.profilePill}><ThemedText type="caption" style={styles.pillText}>TRACKTRAIL • CAREER HUB</ThemedText></View>
          </View>

          <View style={styles.section}>
            <ThemedText type="overline" themeColor="textSecondary" style={styles.sectionLabel}>Career Studio</ThemedText>
            <Pressable onPress={() => go('/resumes')} style={({pressed}) => [styles.feature, pressed && styles.pressed]}>
              <View style={[styles.featureIcon, {backgroundColor:'#DBEAFE'}]}><ThemedText style={{color:'#2563EB',fontSize:21}}>↑</ThemedText></View>
              <View style={styles.featureCopy}><ThemedText type="smallBold">Upload resume</ThemedText><ThemedText type="caption" themeColor="textSecondary">Manage your active resume</ThemedText></View>
              <ChevronRightIcon color={theme.textSecondary} size={17} />
            </Pressable>
            <Pressable onPress={() => go('/tailor')} style={({pressed}) => [styles.feature, pressed && styles.pressed]}>
              <View style={[styles.featureIcon, {backgroundColor:'#F3E8FF'}]}><ThemedText style={{color:'#7C3AED',fontSize:20}}>◎</ThemedText></View>
              <View style={styles.featureCopy}><ThemedText type="smallBold">Check ATS score</ThemedText><ThemedText type="caption" themeColor="textSecondary">Paste a job description</ThemedText></View>
              <ChevronRightIcon color={theme.textSecondary} size={17} />
            </Pressable>
            <Pressable onPress={() => go('/tailor')} style={({pressed}) => [styles.feature, pressed && styles.pressed]}>
              <View style={[styles.featureIcon, {backgroundColor:'#FCE7F3'}]}><ThemedText style={{color:'#DB2777',fontSize:20}}>✦</ThemedText></View>
              <View style={styles.featureCopy}><ThemedText type="smallBold">Tailor my resume</ThemedText><ThemedText type="caption" themeColor="textSecondary">Generate a targeted version</ThemedText></View>
              <ChevronRightIcon color={theme.textSecondary} size={17} />
            </Pressable>
          </View>

          <View style={styles.section}>
            <ThemedText type="overline" themeColor="textSecondary" style={styles.sectionLabel}>Workspace</ThemedText>
            {MENU_ITEMS.map((item) => (
              <Pressable key={item.label} onPress={() => item.href && go(item.href)} style={({pressed}) => [styles.menuItem, pressed && styles.pressed]}>
                <View style={[styles.menuIcon, {backgroundColor:item.soft}]}><ThemedText style={{color:item.tone,fontSize:18,fontWeight:'800'}}>{item.icon}</ThemedText></View>
                <ThemedText type="smallBold" style={styles.menuLabel}>{item.label}</ThemedText>
                <ChevronRightIcon color={theme.textSecondary} size={16} />
              </Pressable>
            ))}
          </View>

          <View style={[styles.footerCard, {backgroundColor: theme.accentSoft}]}>
            <ThemedText type="smallBold">Keep moving.</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">Your next opportunity starts with one strong application.</ThemedText>
          </View>

          <Pressable onPress={handleLogout} style={styles.logout}><ThemedText type="smallBold" themeColor="danger">Log out</ThemedText></Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container:{flex:1}, safeArea:{flex:1}, content:{padding:16,gap:18,paddingBottom:30},
  profileHero:{borderRadius:28,padding:18,overflow:'hidden',gap:5,minHeight:170}, heroOrb:{position:'absolute',width:150,height:150,borderRadius:80,right:-55,top:-60,backgroundColor:'rgba(255,255,255,0.12)'},
  profileTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:6}, settingsButton:{width:40,height:40,borderRadius:13,backgroundColor:'rgba(255,255,255,0.16)',alignItems:'center',justifyContent:'center'}, settingsIcon:{color:'#fff',fontSize:20}, white:{color:'#fff'}, mutedWhite:{color:'rgba(255,255,255,0.75)'},
  profilePill:{alignSelf:'flex-start',marginTop:9,paddingHorizontal:10,paddingVertical:5,borderRadius:999,backgroundColor:'rgba(255,255,255,0.14)'}, pillText:{color:'rgba(255,255,255,0.9)',fontSize:9,letterSpacing:0.8},
  section:{gap:8}, sectionLabel:{marginLeft:4,marginBottom:2}, feature:{flexDirection:'row',alignItems:'center',gap:12,padding:12,borderRadius:20,backgroundColor:'transparent'}, featureIcon:{width:44,height:44,borderRadius:15,alignItems:'center',justifyContent:'center'}, featureCopy:{flex:1,gap:2},
  menuItem:{flexDirection:'row',alignItems:'center',gap:12,padding:8,borderRadius:18,minHeight:58}, menuIcon:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center'}, menuLabel:{flex:1}, pressed:{opacity:0.72,transform:[{scale:0.985}]},
  footerCard:{borderRadius:20,padding:15,gap:4}, logout:{paddingVertical:10,alignItems:'center'},
});
