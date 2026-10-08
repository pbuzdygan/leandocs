import { useEffect, useState } from 'react';
import { useLocation, useNavigationType } from 'react-router';

/**
 * Where this tab is in its browser history (UI_SPEC §94), so the topbar's ← → can be disabled at
 * the ends. Browsers do not reveal the history, so it is followed from the router: each entry is a
 * location key; PUSH drops the forward entries, POP moves to a known key, REPLACE swaps the
 * current one. Kept in session storage (per tab, like the history itself) so a reload keeps it.
 */
interface Position {
  keys: string[];
  index: number;
}

const STORAGE_KEY = 'leandocs.history';
/** Enough for a long session; older entries only lose their "Back" enabling. */
const MAX_ENTRIES = 200;

function read(): Position | undefined {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const value = raw ? (JSON.parse(raw) as Position) : undefined;
    if (
      value &&
      Array.isArray(value.keys) &&
      value.keys.every((key) => typeof key === 'string') &&
      Number.isInteger(value.index) &&
      value.index >= 0 &&
      value.index < value.keys.length
    )
      return value;
  } catch {
    // Storage blocked or damaged: start from the current page.
  }
  return undefined;
}

function write(position: Position): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Only the enabled state of ← → depends on it.
  }
}

export function nextPosition(
  previous: Position | undefined,
  key: string,
  action: 'PUSH' | 'POP' | 'REPLACE',
): Position {
  if (!previous) return { keys: [key], index: 0 };
  const { keys, index } = previous;
  if (keys[index] === key) return previous;
  if (action === 'PUSH') {
    const next = [...keys.slice(0, index + 1), key].slice(-MAX_ENTRIES);
    return { keys: next, index: next.length - 1 };
  }
  if (action === 'REPLACE')
    return { keys: keys.map((entry, at) => (at === index ? key : entry)), index };
  const known = keys.lastIndexOf(key);
  // A key we never saw (history from before this session): treat it as a new start.
  return known === -1 ? { keys: [key], index: 0 } : { keys, index: known };
}

export function useHistoryPosition(): { canGoBack: boolean; canGoForward: boolean } {
  const { key } = useLocation();
  const action = useNavigationType();
  const [position, setPosition] = useState<Position>(() => {
    const stored = read();
    // After a reload the current entry keeps its key; otherwise this is a fresh start.
    return stored && stored.keys[stored.index] === key ? stored : { keys: [key], index: 0 };
  });
  // Adjust the position while rendering the new location, so ← → are right in the same frame.
  const [seenKey, setSeenKey] = useState(key);
  if (seenKey !== key) {
    setSeenKey(key);
    setPosition(nextPosition(position, key, action));
  }
  useEffect(() => write(position), [position]);
  return {
    canGoBack: position.index > 0,
    canGoForward: position.index < position.keys.length - 1,
  };
}
