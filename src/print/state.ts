// Whether the print view is open. Kept out of the main store: it is not part
// of the plan, so it is never saved and never undone.

import { create } from 'zustand';

interface PrintState {
  open: boolean;
  setOpen: (v: boolean) => void;
}

export const usePrint = create<PrintState>()((set) => ({
  open: false,
  setOpen: (v) => set({ open: v }),
}));
