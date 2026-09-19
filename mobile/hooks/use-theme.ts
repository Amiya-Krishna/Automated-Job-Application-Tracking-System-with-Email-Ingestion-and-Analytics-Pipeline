/**
 * Returns the active color palette (constants/theme.ts's Colors[scheme]).
 * Backed by ThemeContext, so it reflects the user's manual light/dark/
 * system choice from Settings, not just the raw OS scheme. Return shape
 * is unchanged from before ThemeContext existed — every screen that
 * already does `const theme = useTheme(); theme.tint` etc. keeps working
 * with no changes.
 */
import { useThemeContext } from '@/context/ThemeContext';

export function useTheme() {
  return useThemeContext().colors;
}
