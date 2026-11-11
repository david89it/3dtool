// Whether the Budget panel is open, and which tab. Not part of the plan, so it
// is never saved or undone.

import { create } from 'zustand';

export type BudgetTab = 'furniture' | 'decorating' | 'summary';

interface BudgetUi {
  open: boolean;
  setOpen: (v: boolean) => void;
  tab: BudgetTab;
  setTab: (t: BudgetTab) => void;
}

export const useBudgetUi = create<BudgetUi>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  tab: 'furniture',
  setTab: (tab) => set({ tab }),
}));
