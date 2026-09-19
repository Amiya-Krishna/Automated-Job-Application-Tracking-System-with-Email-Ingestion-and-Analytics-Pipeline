/**
 * App-wide theme mode: light / dark / system, persisted to disk so it
 * survives a restart, with an automatic fallback to the OS scheme when
 * the user hasn't (or hasn't yet) chosen one explicitly.
 *
 * Every existing screen already reads colors via hooks/use-theme.ts's
 * `useTheme()` and hooks/use-color-scheme.ts's `useColorScheme()` — both
 * of those are re-pointed at this context (see those files) so this is
 * the ONE place a manual override has to be implemented; no per-screen
 * changes were needed to make the whole app respect it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, type ColorSchemeName } from 'react-native';

import { Colors } from '@/constants/theme';

export type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedScheme = 'light' | 'dark';

const STORAGE_KEY = '@tracktrail/theme-mode';

interface ThemeContextValue {
  /** The user's chosen preference — may be 'system'. */
  mode: ThemeMode;
  /** What 'system' currently resolves to, or the explicit choice. Always 'light' | 'dark'. */
  colorScheme: ResolvedScheme;
  /** Colors[colorScheme] — the actual palette every ThemedView/ThemedText paints with. */
  colors: (typeof Colors)['light'];
  isDark: boolean;
  /** Persists to AsyncStorage and updates every consumer immediately. */
  setMode: (mode: ThemeMode) => void;
  /** Whether the persisted preference has finished loading from disk yet. */
  isReady: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveScheme(mode: ThemeMode, system: ColorSchemeName): ResolvedScheme {
  if (mode === 'system') return system === 'dark' ? 'dark' : 'light';
  return mode;
}

export function ThemeContextProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(Appearance.getColorScheme());
  const [isReady, setIsReady] = useState(false);

  // Load the persisted choice once on mount. Until this resolves, `mode`
  // stays at the 'system' default above — the same "no flash of the
  // wrong screen" reasoning AuthProvider.tsx uses for its own hydration.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (cancelled) return;
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setModeState(stored);
      }
      setIsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keeps 'system' mode live if the OS theme changes while the app is open.
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => subscription.remove();
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  };

  const value = useMemo<ThemeContextValue>(() => {
    const colorScheme = resolveScheme(mode, systemScheme);
    return {
      mode,
      colorScheme,
      colors: Colors[colorScheme],
      isDark: colorScheme === 'dark',
      setMode,
      isReady,
    };
  }, [mode, systemScheme, isReady]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext() must be called within <ThemeContextProvider>.');
  }
  return context;
}
