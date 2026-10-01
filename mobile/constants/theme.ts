/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/** Shared shape for a color palette, so `light` and `dark` are guaranteed to
 * have identical keys/value types — code that reads `colors[key]` works the
 * same regardless of which palette resolved. */
export interface ThemePalette {
  text: string;
  background: string;
  backgroundElement: string;
  backgroundSelected: string;
  textSecondary: string;
  tint: string;
  danger: string;
  border: string;
  accent: string;
  accentSoft: string;
  success: string;
  warning: string;
  purple: string;
  pink: string;
}

export const Colors: { light: ThemePalette; dark: ThemePalette } = {
  light: {
    text: '#111827',
    background: '#F7F8FC',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EEF2FF',
    textSecondary: '#667085', // >= 6:1 on white and on backgroundElement
    // Matches the web client's primary accent (blue-600) and error color
    // (red-600) — client/src/components, client/src/pages/*.jsx.
    tint: '#4F46E5',
    danger: '#DC2626', // 6.5:1 on white, 5.9:1 on backgroundElement (WCAG AA for small text)
    border: '#E7EAF0',
    accent: '#7C3AED',
    accentSoft: '#F3E8FF',
    success: '#10B981',
    warning: '#F59E0B',
    purple: '#8B5CF6',
    pink: '#EC4899',
  },
  dark: {
    text: '#F8FAFC',
    background: '#0B0F19',
    backgroundElement: '#151B2A',
    backgroundSelected: '#222A3D',
    textSecondary: '#98A2B3',
    tint: '#818CF8',
    danger: '#F87171',
    border: '#263044',
    accent: '#A78BFA',
    accentSoft: '#2E214A',
    success: '#34D399',
    warning: '#FBBF24',
    purple: '#A78BFA',
    pink: '#F472B6',
  },
};

export type ThemeColor = keyof ThemePalette;

/**
 * Typeface: Inter (loaded in app/_layout.tsx via @expo-google-fonts/inter).
 * React Native custom fonts are addressed per WEIGHT (fontWeight is ignored for
 * them on Android), so ThemedText maps the requested weight to one of these.
 * Before the fonts finish loading the OS system font is used, so nothing blocks.
 */
export const FontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export function fontFamilyForWeight(weight: string | number | undefined): string {
  const w = Number(weight ?? 400);
  if (w >= 700) return FontFamily.bold;
  if (w >= 600) return FontFamily.semibold;
  if (w >= 500) return FontFamily.medium;
  return FontFamily.regular;
}

/** One type scale for the whole app (size / line-height / weight / tracking). */
export const Typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.6 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', letterSpacing: -0.2 },
  headline: { fontSize: 17, lineHeight: 24, fontWeight: '600', letterSpacing: -0.1 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400', letterSpacing: 0 },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '500', letterSpacing: 0 },
  smallBold: { fontSize: 14, lineHeight: 20, fontWeight: '600', letterSpacing: 0 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0.1 },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.8 },
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: FontFamily.regular,
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: FontFamily.regular,
    serif: 'serif',
    rounded: FontFamily.regular,
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
