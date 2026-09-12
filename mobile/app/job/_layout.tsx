import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * Mirrors app/application/_layout.tsx — a plain Stack for the Job Detail
 * screen reached from the Jobs tab, registered as a sibling of `(tabs)`
 * in the root layout's authenticated Stack.Protected block.
 */
export default function JobLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.tint,
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="[id]" options={{ title: 'Job' }} />
    </Stack>
  );
}
