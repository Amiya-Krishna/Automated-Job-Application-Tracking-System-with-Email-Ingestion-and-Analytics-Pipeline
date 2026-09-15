import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * A plain (non-tab) Stack for the profile-edit form, reached from the
 * Profile tab. Named `account`, not `profile`, deliberately — the
 * Profile *tab* already occupies the `/profile` route
 * (app/(tabs)/profile.tsx), and Expo Router can't have a file and a
 * folder both claim that exact segment, the same reason this app uses
 * `application`/`applications` and `job`/`jobs` as distinct pairs (see
 * app/application/_layout.tsx, app/job/_layout.tsx). Registered as a
 * sibling of `(tabs)` inside the root layout's authenticated
 * `Stack.Protected` block (app/_layout.tsx).
 */
export default function AccountLayout() {
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
      <Stack.Screen name="edit" options={{ title: 'Edit Profile' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  );
}
