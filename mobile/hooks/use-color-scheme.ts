/**
 * The app's own useColorScheme — distinct from react-native's built-in
 * hook of the same name. Every call site that cares about light/dark
 * (NativeTabs styling, StatusBadge colors, the account stack's header
 * colors, the root ThemeProvider) imports THIS one, so re-pointing it at
 * ThemeContext here is what makes a manual theme override from Settings
 * apply everywhere, without touching any of those call sites.
 */
import { useThemeContext } from '@/context/ThemeContext';

export function useColorScheme() {
  return useThemeContext().colorScheme;
}
