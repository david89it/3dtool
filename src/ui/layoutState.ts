// Which side panels are open. Kept per browser (localStorage, never required).
// Under NARROW_PX both panels start closed and open over the plan instead of
// squeezing it; that choice is not remembered.

import { create } from 'zustand';

export const NARROW_PX = 1000;
const KEY = 'flatplan.panels';

export type Side = 'left' | 'right';

function narrowNow(): boolean {
  try {
    return window.matchMedia(`(max-width: ${NARROW_PX - 1}px)`).matches;
  } catch {
    return false;
  }
}

function readSaved(): { left: boolean; right: boolean } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as { left?: unknown; right?: unknown };
      return { left: v.left !== false, right: v.right !== false };
    }
  } catch {
    // private window or blocked storage: start open
  }
  return { left: true, right: true };
}

function save(v: { left: boolean; right: boolean }): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // not remembered; the panels still work
  }
}

interface LayoutState {
  left: boolean;
  right: boolean;
  /** Narrow screen: panels open over the plan. */
  narrow: boolean;
  setOpen: (side: Side, open: boolean) => void;
  toggle: (side: Side) => void;
  closeAll: () => void;
  setNarrow: (n: boolean) => void;
}

const startNarrow = narrowNow();

export const useLayout = create<LayoutState>()((set, get) => ({
  ...(startNarrow ? { left: false, right: false } : readSaved()),
  narrow: startNarrow,
  setOpen: (side, open) => {
    const s = get();
    // On a narrow screen only one panel is open at a time.
    const next = { left: s.left, right: s.right, [side]: open } as { left: boolean; right: boolean };
    if (s.narrow && open) next[side === 'left' ? 'right' : 'left'] = false;
    set(next);
    if (!s.narrow) save(next);
  },
  toggle: (side) => get().setOpen(side, !get()[side]),
  closeAll: () => set({ left: false, right: false }),
  setNarrow: (n) => {
    if (n === get().narrow) return;
    if (n) set({ narrow: true, left: false, right: false });
    else set({ narrow: false, ...readSaved() });
  },
}));

/** Follow the window width. Call once, from the app. */
export function watchWidth(): () => void {
  try {
    const mq = window.matchMedia(`(max-width: ${NARROW_PX - 1}px)`);
    const on = () => useLayout.getState().setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  } catch {
    return () => {};
  }
}
