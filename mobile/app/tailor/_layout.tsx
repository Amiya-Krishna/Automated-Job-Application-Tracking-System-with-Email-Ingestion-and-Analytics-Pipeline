import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

/** Mirrors app/job/_layout.tsx — a plain Stack for the Resume Tailoring screen. */
export default function TailorLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Tailor Resume' }} />
    </Stack>
  );
}
