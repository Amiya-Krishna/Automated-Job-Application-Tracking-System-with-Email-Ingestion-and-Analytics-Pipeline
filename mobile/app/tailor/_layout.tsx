import { Stack } from 'expo-router';

import { ThemedStack } from '@/components/themed-stack';

/** Mirrors app/job/_layout.tsx — a plain Stack for the Resume Tailoring screen. */
export default function TailorLayout() {
  return (
    <ThemedStack>
      <Stack.Screen name="index" options={{ title: 'Tailor Resume' }} />
    </ThemedStack>
  );
}
