// Whether the search palette (Ctrl/⌘ K) is open, and what she picked lately.
// Not part of the plan, so it is never saved with it or undone. Recent picks are
// remembered in this browser only.

import { create } from 'zustand';

const KEY = 'flatplan.palette.recent';
const MAX_RECENT = 8;

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

interface PaletteState {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  /** Ids of recent picks, newest first. */
  recent: string[];
  remember: (id: string) => void;
}

export const usePalette = create<PaletteState>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set({ open: !get().open }),
  recent: load(),
  remember: (id) => {
    const recent = [id, ...get().recent.filter((x) => x !== id)].slice(0, MAX_RECENT);
    set({ recent });
    try {
      localStorage.setItem(KEY, JSON.stringify(recent));
    } catch {
      /* private window: recents just last for this visit */
    }
  },
}));
