import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * A plain Stack for the two static legal screens, same reasoning as
 * app/account/_layout.tsx: a small standalone group reached by push,
 * not part of the tab bar or drawer's screen list.
 */
export default function LegalLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.tint,
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="privacy" options={{ title: 'Privacy Policy' }} />
      <Stack.Screen name="terms" options={{ title: 'Terms of Service' }} />
    </Stack>
  );
}
