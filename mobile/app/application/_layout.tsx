import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * A plain (non-tab) Stack for everything reached from the Applications
 * tab that isn't itself a tab: detail, add, and edit. Registered as a
 * sibling of `(tabs)` inside the root layout's authenticated
 * `Stack.Protected` block (app/_layout.tsx) — so it's still gated behind
 * the same auth guard, it just isn't one of the five bottom tabs.
 */
export default function ApplicationLayout() {
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
      <Stack.Screen name="[id]/index" options={{ title: 'Application' }} />
      <Stack.Screen name="[id]/edit" options={{ title: 'Edit Application' }} />
      <Stack.Screen name="add" options={{ title: 'Add Application' }} />
    </Stack>
  );
}
