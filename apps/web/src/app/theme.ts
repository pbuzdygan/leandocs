import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { THEMES, type Theme } from '@leandocs/shared';
import { useSettings } from '../api/queries';
import { useMediaQuery } from '../utils/media';
import { readPreference, writePreference } from '../utils/storage';

export type ResolvedTheme = 'light' | 'dark';

const PREFERS_DARK = '(prefers-color-scheme: dark)';
/**
 * The last theme setting seen in this browser (`leandocs.theme`). The setting itself lives on the
 * server, which the login and setup pages cannot read; `public/theme-init.js` also reads this
 * before the first paint, so dark mode does not flash light while the app starts.
 */
const CACHE_KEY = 'theme';

const listeners = new Set<() => void>();

function cachedTheme(): Theme {
  const theme = readPreference<unknown>(CACHE_KEY, 'system');
  return THEMES.includes(theme as Theme) ? (theme as Theme) : 'system';
}

function setCachedTheme(theme: Theme): void {
  if (theme === cachedTheme()) return;
  writePreference(CACHE_KEY, theme);
  for (const listener of listeners) listener();
}

function subscribeCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resolveTheme(theme: Theme, systemDark: boolean): ResolvedTheme {
  if (theme === 'system') return systemDark ? 'dark' : 'light';
  return theme;
}

/** `data-theme` on `<html>` selects the dark tokens (`styles/tokens.css`). */
function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
}

/**
 * Shows the theme on every page, signed in or not (UI_SPEC §84): the cached setting, resolved
 * against the system preference, which is followed live for "System". Rendered once at the root.
 */
export function ThemeController(): null {
  const theme = useSyncExternalStore(subscribeCache, cachedTheme);
  const systemDark = useMediaQuery(PREFERS_DARK);
  useLayoutEffect(() => applyTheme(resolveTheme(theme, systemDark)), [theme, systemDark]);
  return null;
}

/** Keeps the cached theme in step with Settings › Appearance while signed in (inside the shell). */
export function useThemeSetting(): void {
  const theme = useSettings().data?.appearance.theme;
  useEffect(() => {
    if (theme) setCachedTheme(theme);
  }, [theme]);
}

function subscribeShown(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/** The theme currently shown, for code that draws its own colours (Mermaid diagrams). */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeShown, () =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );
}
