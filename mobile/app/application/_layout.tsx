import { Stack } from 'expo-router';

import { ThemedStack } from '@/components/themed-stack';

/**
 * A plain (non-tab) Stack for everything reached from the Applications
 * tab that isn't itself a tab: detail, add, and edit. Registered as a
 * sibling of `(drawer)` inside the root layout's authenticated
 * `Stack.Protected` block (app/_layout.tsx) — so it's still gated behind
 * the same auth guard, it just isn't one of the five bottom tabs.
 */
export default function ApplicationLayout() {
  return (
    <ThemedStack>
      <Stack.Screen name="[id]/index" options={{ title: 'Application' }} />
      <Stack.Screen name="[id]/edit" options={{ title: 'Edit Application' }} />
      <Stack.Screen name="add" options={{ title: 'Add Application' }} />
    </ThemedStack>
  );
}
