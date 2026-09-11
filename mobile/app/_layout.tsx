import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/hooks/use-auth';
import { AuthProvider } from '@/providers/AuthProvider';
import { QueryProvider } from '@/providers/QueryProvider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <QueryProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}

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
 *     cannot navigate into (tabs) at all, because that branch doesn't
 *     exist in the navigator while `guard` is false, not because a
 *     screen chose to redirect them away from it.
 */
function RootNavigator() {
  const { status } = useAuth();

  useEffect(() => {
    if (status !== 'hydrating') {
      SplashScreen.hideAsync();
    }
  }, [status]);

  if (status === 'hydrating') {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ThemedText type="small" themeColor="textSecondary">
          Loading…
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'authenticated'}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'unauthenticated'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
