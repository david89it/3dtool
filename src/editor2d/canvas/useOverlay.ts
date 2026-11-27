// The hover/drag overlay state, kept the same object when nothing changed.
import { useCallback, useState } from 'react';
import type { Overlay } from '../tools/types';

/** Two overlays that draw the same thing (undefined fields count as missing; points compare by value). */
function sameOverlay(a: unknown, b: unknown, depth = 0): boolean {
  if (a === b) return true;
  if (depth > 4 || typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => sameOverlay((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], depth + 1));
}

export function useOverlay() {
  const [overlay, setOverlayRaw] = useState<Overlay>({});
  // Hovering produces a new overlay on every pointer move even when nothing under the pointer
  // changed; keep the old one then, so the whole plan is not redrawn for nothing.
  const setOverlay = useCallback((v: Overlay | ((o: Overlay) => Overlay)) => {
    setOverlayRaw((prev) => {
      const next = typeof v === 'function' ? v(prev) : v;
      return sameOverlay(prev, next) ? prev : next;
    });
  }, []);
  return [overlay, setOverlay] as const;
}
