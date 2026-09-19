/**
 * The hamburger-menu Drawer that wraps the whole authenticated tab area.
 * Registered as "(drawer)" in the root Stack.Protected block
 * (app/_layout.tsx), replacing the bare "(tabs)" screen that used to sit
 * there directly — (tabs) now nests one level deeper, at
 * app/(drawer)/(tabs)/, but every route path is unaffected (group
 * folders like "(drawer)" and "(tabs)" never appear in the URL), so
 * every existing router.push('/jobs') / router.navigate('/profile') /
 * etc. call elsewhere in the app keeps working unchanged.
 *
 * headerShown is off here: every screen inside (including each tab)
 * already renders its own header — either the rich DashboardHeader or
 * the shared ScreenHeader, both of which open this drawer via
 * `navigation.dispatch(DrawerActions.openDrawer())` — so a second,
 * default Drawer header would just duplicate that bar. The drawer is
 * still reachable by that hamburger button OR the standard swipe-from-
 * left-edge gesture, which React Navigation's drawer provides for free.
 */
import { Drawer } from 'expo-router/drawer';

import { DrawerContent } from '@/components/drawer-content';
import { useTheme } from '@/hooks/use-theme';

// GestureHandlerRootView is provided once, at the true app root
// (app/_layout.tsx) — required for this Drawer's swipe gesture and any
// other gesture-handler-based component anywhere in the tree, not just
// here.
export default function DrawerLayout() {
  const theme = useTheme();

  return (
    <Drawer
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        drawerStyle: { backgroundColor: theme.background, width: 300 },
        overlayColor: 'rgba(0,0,0,0.4)',
      }}>
      <Drawer.Screen name="(tabs)" options={{ title: 'Dashboard' }} />
      <Drawer.Screen name="resume-insights" options={{ title: 'Resume Insights' }} />
      <Drawer.Screen name="saved-jobs" options={{ title: 'Saved Jobs' }} />
      <Drawer.Screen name="help" options={{ title: 'Help' }} />
      <Drawer.Screen name="about" options={{ title: 'About' }} />
    </Drawer>
  );
}
