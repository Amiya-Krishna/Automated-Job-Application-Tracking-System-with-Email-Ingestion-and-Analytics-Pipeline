import { Stack } from 'expo-router';

import { ThemedStack } from '@/components/themed-stack';

/**
 * Mirrors app/job/_layout.tsx / app/account/_layout.tsx — a plain Stack
 * for a feature reached from elsewhere (currently: the Jobs tab's
 * "Companies" link), not itself a tab.
 */
export default function CompaniesLayout() {
  return (
    <ThemedStack>
      <Stack.Screen name="index" options={{ title: 'Companies' }} />
      <Stack.Screen name="[id]" options={{ title: 'Company' }} />
    </ThemedStack>
  );
}
