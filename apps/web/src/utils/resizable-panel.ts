import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { readPreference, writePreference } from './storage';

export interface PanelBounds {
  /** Preference key the width is remembered under (per browser). */
  key: string;
  min: number;
  max: number;
  initial: number;
  /** Which edge the handle sits on: dragging away from the panel makes it wider. */
  edge: 'right' | 'left';
}

export function clampPanelWidth(width: number, { min, max }: Pick<PanelBounds, 'min' | 'max'>) {
  return Math.min(max, Math.max(min, Math.round(width)));
}

/**
 * A side panel resizable with the pointer or the arrow keys (UI_SPEC §17, §108), remembered per
 * browser. Spread `separatorProps` on a `role="separator"` element at the panel's edge.
 */
export function useResizablePanel(bounds: PanelBounds) {
  const { key, min, max, initial, edge } = bounds;
  const [width, setWidth] = useState(() =>
    clampPanelWidth(readPreference(key, initial), { min, max }),
  );
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  // Pointer movement to the right widens a panel whose handle is on its right edge.
  const direction = edge === 'right' ? 1 : -1;

  const commit = (next: number) => {
    const clamped = clampPanelWidth(next, { min, max });
    setWidth(clamped);
    writePreference(key, clamped);
  };

  const separatorProps = {
    role: 'separator' as const,
    'aria-orientation': 'vertical' as const,
    'aria-valuemin': min,
    'aria-valuemax': max,
    'aria-valuenow': width,
    tabIndex: 0,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      drag.current = { startX: event.clientX, startWidth: width };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (!drag.current) return;
      const moved = (event.clientX - drag.current.startX) * direction;
      setWidth(clampPanelWidth(drag.current.startWidth + moved, { min, max }));
    },
    onPointerUp: () => {
      if (drag.current) commit(width);
      drag.current = null;
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      // The arrow points where the handle moves.
      if (event.key === 'ArrowLeft') commit(width - 16 * direction);
      else if (event.key === 'ArrowRight') commit(width + 16 * direction);
      else return;
      event.preventDefault();
    },
    onDoubleClick: () => commit(initial),
  };

  return { width, separatorProps };
}
