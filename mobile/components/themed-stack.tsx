import { Stack } from 'expo-router';
import type { ComponentProps } from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * A plain Stack with the app's themed header (background, tint, title colour,
 * no shadow). Shared by the feature-level `_layout.tsx` files so the header
 * styling lives in one place. Declare screens as children via `Stack.Screen`.
 */
export function ThemedStack({ children, ...props }: ComponentProps<typeof Stack>) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <Stack
      {...props}
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.tint,
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
      }}>
      {children}
    </Stack>
  );
}
