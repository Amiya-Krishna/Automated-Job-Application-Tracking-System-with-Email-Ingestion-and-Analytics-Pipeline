import { Stack } from 'expo-router';

import { ThemedStack } from '@/components/themed-stack';

export default function SourcesLayout() {
  return (
    <ThemedStack>
      <Stack.Screen name="index" options={{ title: 'Sources' }} />
      <Stack.Screen name="[id]" options={{ title: 'Source' }} />
    </ThemedStack>
  );
}
