import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CommandPalette, type PaletteMode } from './CommandPalette';

interface SearchControls {
  /** Opens the command palette in full-text search mode (Ctrl/Cmd+K, UI_SPEC §59). */
  openSearch: (query?: string) => void;
  /** Opens the palette in quick-open mode (Ctrl/Cmd+P, UI_SPEC §63). */
  openQuickOpen: () => void;
}

const SearchContext = createContext<SearchControls>({
  openSearch: () => undefined,
  openQuickOpen: () => undefined,
});

/** "⌘" on Apple platforms, "Ctrl" elsewhere — for shortcut hints. */
export function modifierLabel(): string {
  const platform =
    typeof navigator === 'undefined' ? '' : navigator.platform || navigator.userAgent;
  return /Mac|iPhone|iPad/i.test(platform) ? '⌘' : 'Ctrl';
}

/** Owns the palette and the global shortcuts. Must be rendered inside the router. */
export function SearchProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<PaletteMode | null>(null);
  const [initialQuery, setInitialQuery] = useState('');

  useEffect(() => {
    // Capture phase, so the shortcuts also work inside the editors and replace the browser's
    // own Ctrl+P (print) and Ctrl+K (address bar search) while LeanDocs is focused.
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key !== 'k' && key !== 'p') return;
      event.preventDefault();
      event.stopPropagation();
      setInitialQuery('');
      setMode(key === 'k' ? 'search' : 'open');
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const openSearch = useCallback((query = '') => {
    setInitialQuery(query);
    setMode('search');
  }, []);
  const openQuickOpen = useCallback(() => {
    setInitialQuery('');
    setMode('open');
  }, []);
  const controls = useMemo(() => ({ openSearch, openQuickOpen }), [openSearch, openQuickOpen]);

  return (
    <SearchContext.Provider value={controls}>
      {children}
      {mode && (
        <CommandPalette
          mode={mode}
          initialQuery={initialQuery}
          onModeChange={setMode}
          onClose={() => setMode(null)}
        />
      )}
    </SearchContext.Provider>
  );
}

export function useSearchControls(): SearchControls {
  return useContext(SearchContext);
}
