import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * Mirrors app/job/_layout.tsx / app/account/_layout.tsx — a plain Stack
 * for a feature reached from elsewhere (currently: the Jobs tab's
 * "Companies" link), not itself a tab.
 */
export default function CompaniesLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Companies' }} />
      <Stack.Screen name="[id]" options={{ title: 'Company' }} />
    </Stack>
  );
}
