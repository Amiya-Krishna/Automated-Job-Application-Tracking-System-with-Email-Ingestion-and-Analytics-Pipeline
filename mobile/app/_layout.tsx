import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppErrorBoundary } from '@/components/app-error-boundary';
import { NotificationLinkHandler } from '@/components/notification-link-handler';
import { OfflineBanner } from '@/components/offline-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { ThemeContextProvider } from '@/context/ThemeContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { useAuth } from '@/hooks/use-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider } from '@/providers/AuthProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import { setAppInfo } from '@/services/config';
import { initMonitoring, wrapRootComponent } from '@/services/monitoring';
import { startNetworkMonitoring } from '@/services/network';
import { configureNotificationHandler } from '@/services/push';

SplashScreen.preventAutoHideAsync();

// Runs once, before the first render: crash reporting (no-op without a DSN),
// app/device info for request headers, and the foreground notification behaviour.
initMonitoring();
setAppInfo({
  version: Application.nativeApplicationVersion ?? 'dev',
  platform: Platform.OS,
  deviceName: Device.modelName ?? null,
});
configureNotificationHandler();

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  // Never block the app on fonts: after 3s fall back to the system font.
  const [fontTimeout, setFontTimeout] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFontTimeout(true), 3000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => startNetworkMonitoring(), []);

  const fontsReady = fontsLoaded || Boolean(fontError) || fontTimeout;

  return (
    // Required once, at the true app root, for the drawer's swipe
    // gesture (app/(drawer)/_layout.tsx) and any other
    // react-native-gesture-handler-based component in the tree.
    <AppErrorBoundary>
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Outermost: resolves the light/dark/system choice everything
          else (including the two providers below and every themed
          component) reads via hooks/use-theme(-mode).ts and
          hooks/use-color-scheme.ts. */}
      <ThemeContextProvider>
        <QueryProvider>
          <AuthProvider>
            {/* Reads auth status (clears its list on sign-out), so it must
                nest inside AuthProvider. */}
            <NotificationProvider>
              <RootNavigator fontsReady={fontsReady} />
              <NotificationLinkHandler />
              <OfflineBanner />
            </NotificationProvider>
          </AuthProvider>
        </QueryProvider>
      </ThemeContextProvider>
    </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}

export default wrapRootComponent(RootLayout);

/**
 * Reads auth status and decides what to render:
 *
 *   - 'hydrating': the SecureStore read (services/tokenStore.ts) hasn't
 *     finished yet. Nothing auth-dependent renders — just a plain
 *     loading view, with the native splash screen still covering it
 *     until this resolves, so an already-logged-in user never sees a
 *     flash of the login screen on a normal restart.
 *   - 'authenticated' / 'unauthenticated': a Stack with two mutually
 *     exclusive Stack.Protected branches. This is what makes
 *     authentication a property of the ROUTE STRUCTURE rather than
 *     something a screen decides for itself — an unauthenticated user
 *     cannot navigate into (drawer) at all, because that branch doesn't
 *     exist in the navigator while `guard` is false, not because a
 *     screen chose to redirect them away from it.
 */
function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { status } = useAuth();
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  useEffect(() => {
    if (status !== 'hydrating' && fontsReady) {
      SplashScreen.hideAsync();
    }
  }, [status, fontsReady]);

  if (status === 'hydrating' || !fontsReady) {
    return (
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ThemedText type="small" themeColor="textSecondary">
            Loading…
          </ThemedText>
        </ThemedView>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        {/* Password-reset deep link target. Deliberately OUTSIDE both Stack.Protected
            branches: the emailed link must open this screen whether or not a session
            is stored on the device. */}
        <Stack.Screen name="reset-password" />
        <Stack.Protected guard={status === 'authenticated'}>
          {/* The drawer-wrapped tab area (Home/Jobs/Analytics/Notifications/
              Profile) plus the drawer's own static screens — see
              app/(drawer)/_layout.tsx. Was a bare "(tabs)" screen before
              the drawer redesign; every route path is unchanged since
              group folders don't appear in the URL. */}
          <Stack.Screen name="(drawer)" />
          {/* "Job Tracker" in the drawer — promoted out of the tab bar
              (see app/(drawer)/(tabs)/_layout.tsx's comment) into its own
              pushed screen, with a native header + back button. */}
          <Stack.Screen
            name="applications"
            options={{
              headerShown: true,
              title: 'Job Tracker',
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.tint,
              headerTitleStyle: { color: colors.text },
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen name="application" />
          <Stack.Screen name="job" />
          <Stack.Screen name="tailor" />
          <Stack.Screen name="resumes" />
          <Stack.Screen name="account" />
          <Stack.Screen name="companies" />
          <Stack.Screen name="sources" />
          <Stack.Screen name="legal" />
          <Stack.Screen
            name="engine-applications"
            options={{
              headerShown: true,
              title: 'Engine Applications',
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.tint,
              headerTitleStyle: { color: colors.text },
              headerShadowVisible: false,
            }}
          />
        </Stack.Protected>
        <Stack.Protected guard={status === 'unauthenticated'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
