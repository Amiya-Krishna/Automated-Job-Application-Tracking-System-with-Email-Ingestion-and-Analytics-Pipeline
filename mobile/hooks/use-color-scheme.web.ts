/**
 * Web variant — kept as a separate file (Metro/webpack picks this one
 * automatically for web bundles) for the same static-rendering hydration
 * reason the original scaffold file explained, but now backed by
 * ThemeContext instead of react-native's raw useColorScheme so a manual
 * theme override applies on web too.
 */
import { useThemeContext } from '@/context/ThemeContext';

export function useColorScheme() {
  const { colorScheme, isReady } = useThemeContext();
  // Before the persisted preference has loaded, fall back to 'light' to
  // match server-rendered/static output rather than flashing dark mode.
  return isReady ? colorScheme : 'light';
}
