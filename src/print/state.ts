// Whether the print view is open, and which saved version it compares with.
// Kept out of the main store: it is not part of the plan, so it is never
// saved and never undone. The choice lasts for the session (until the page
// is reloaded).

import { create } from 'zustand';

/** `undefined`: not chosen yet, so the default applies. `null`: she chose no comparison. */
export type CompareChoice = string | null | undefined;

interface PrintState {
  open: boolean;
  setOpen: (v: boolean) => void;
  compareId: CompareChoice;
  setCompareId: (v: string | null) => void;
}

export const usePrint = create<PrintState>()((set) => ({
  open: false,
  setOpen: (v) => set({ open: v }),
  compareId: undefined,
  setCompareId: (v) => set({ compareId: v }),
}));
