import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

/** Mirrors app/tailor/_layout.tsx — a plain Stack for the My Resumes screen. */
export default function ResumesLayout() {
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
      <Stack.Screen name="index" options={{ title: 'My Resumes' }} />
    </Stack>
  );
}
