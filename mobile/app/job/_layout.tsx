import { Stack } from 'expo-router';

import { ThemedStack } from '@/components/themed-stack';

/**
 * Mirrors app/application/_layout.tsx — a plain Stack for the Job Detail
 * screen reached from the Jobs tab, registered as a sibling of `(drawer)`
 * in the root layout's authenticated Stack.Protected block.
 */
export default function JobLayout() {
  return (
    <ThemedStack>
      <Stack.Screen name="[id]" options={{ title: 'Job' }} />
    </ThemedStack>
  );
}
