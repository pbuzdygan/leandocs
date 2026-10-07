import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { readPreference, writePreference } from '../utils/storage';
import { ancestorFolders } from './tree-utils';

/** Id of the phone navigation drawer, referenced by the topbar menu button (`aria-controls`). */
export const NAVIGATION_DRAWER_ID = 'navigation-drawer';

interface NavigationState {
  expanded: ReadonlySet<string>;
  toggle: (folderPath: string) => void;
  setExpanded: (folderPath: string, open: boolean) => void;
  /** Expands every ancestor so the item at `path` becomes visible. */
  reveal: (path: string, includeSelf?: boolean) => void;
  /** Mobile drawer state (UI_SPEC §101, §103). */
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
}

const NavigationContext = createContext<NavigationState | null>(null);
const STORAGE_KEY = 'tree.expanded';

/** Expanded folders are a per-browser UI preference (PROJECT_SPEC §42). */
export function NavigationProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpandedState] = useState<ReadonlySet<string>>(
    () => new Set(readPreference<string[]>(STORAGE_KEY, [])),
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const update = useCallback((change: (next: Set<string>) => void) => {
    setExpandedState((current) => {
      const next = new Set(current);
      change(next);
      writePreference(STORAGE_KEY, [...next]);
      return next;
    });
  }, []);

  const value = useMemo<NavigationState>(
    () => ({
      expanded,
      toggle: (path) => update((next) => (next.has(path) ? next.delete(path) : next.add(path))),
      setExpanded: (path, open) => update((next) => (open ? next.add(path) : next.delete(path))),
      reveal: (path, includeSelf = false) =>
        update((next) => {
          for (const folder of ancestorFolders(path)) next.add(folder);
          if (includeSelf && path !== '') next.add(path);
        }),
      drawerOpen,
      setDrawerOpen,
    }),
    [expanded, update, drawerOpen],
  );
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigationState(): NavigationState {
  const value = useContext(NavigationContext);
  if (!value) throw new Error('useNavigationState must be used inside NavigationProvider');
  return value;
}
