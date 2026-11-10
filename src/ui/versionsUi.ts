import { create } from 'zustand';
import type { HistoryFile } from '../model/versions';

interface VersionsUi {
  open: boolean;
  setOpen: (v: boolean) => void;
  /** "Include versions when saving a copy" ticked in the panel. */
  includeHistory: boolean;
  setIncludeHistory: (v: boolean) => void;
  /** A file that was just opened had versions in it; waiting for her answer. */
  offer: { history: HistoryFile; planName: string } | null;
  setOffer: (o: { history: HistoryFile; planName: string } | null) => void;
}

export const useVersionsUi = create<VersionsUi>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  includeHistory: false,
  setIncludeHistory: (includeHistory) => set({ includeHistory }),
  offer: null,
  setOffer: (offer) => set({ offer }),
}));
