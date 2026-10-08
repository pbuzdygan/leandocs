import { useSyncExternalStore } from 'react';

/**
 * Layout breakpoints used by components (UI_SPEC §98). CSS repeats the same values in its media
 * queries; keep both in step.
 */
export const MEDIA = {
  /** Phones: navigation becomes a drawer (§101). */
  mobile: '(max-width: 767px)',
  /**
   * Room for the context panel next to the document. Below this (tablets, small desktops, phones)
   * it opens as a drawer from the document header instead (§100–101).
   */
  contextInline: '(min-width: 1200px)',
} as const;

/** Whether a media query matches, updated when the viewport changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia?.(query);
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    () => window.matchMedia?.(query).matches ?? false,
  );
}
