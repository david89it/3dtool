// Side-by-side compare of two layouts of the floor she is on. Screen state
// only: it is not part of the plan and is not saved.

import { create } from 'zustand';

interface CompareState {
  open: boolean;
  /** Layout ids (levels) on the left and right; the view closes itself if one disappears. */
  left: string;
  right: string;
  show: (left: string, right: string) => void;
  setLeft: (id: string) => void;
  setRight: (id: string) => void;
  close: () => void;
}

export const useCompare = create<CompareState>((set) => ({
  open: false,
  left: '',
  right: '',
  show: (left, right) => set({ open: true, left, right }),
  setLeft: (left) => set({ left }),
  setRight: (right) => set({ right }),
  close: () => set({ open: false }),
}));
