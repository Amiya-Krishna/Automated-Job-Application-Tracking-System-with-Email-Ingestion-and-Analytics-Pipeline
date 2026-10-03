import { Stack } from 'expo-router';

import { ThemedStack } from '@/components/themed-stack';

/** Mirrors app/tailor/_layout.tsx — a plain Stack for the My Resumes screen. */
export default function ResumesLayout() {
  return (
    <ThemedStack>
      <Stack.Screen name="index" options={{ title: 'My Resumes' }} />
    </ThemedStack>
  );
}
