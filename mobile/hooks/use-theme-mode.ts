/**
 * The Settings screen's Appearance section reads/writes theme mode
 * through this hook rather than useTheme() (which only exposes the
 * resolved colors, not the underlying 'light' | 'dark' | 'system' choice
 * or the setter).
 */
import { useThemeContext } from '@/context/ThemeContext';

export type { ThemeMode } from '@/context/ThemeContext';

export function useThemeMode() {
  const { mode, setMode, colorScheme, isDark } = useThemeContext();
  return { mode, setMode, colorScheme, isDark };
}
