// UI state for site measure and scan import, kept apart from the main store.
// Her place in the checklist is saved in this browser so she can stop and
// carry on later (the measurements themselves are in the project).

import { create } from 'zustand';
import { get, set } from 'idb-keyval';

export type StepStatus = 'done' | 'skipped' | 'cant';

export interface Session {
  stepIds: string[];
  status: Record<string, StepStatus>;
  index: number;
}

interface SiteState {
  open: boolean;
  guideOpen: boolean;
  importOpen: boolean;
  session: Session | null;
  setOpen: (v: boolean) => void;
  setGuideOpen: (v: boolean) => void;
  setImportOpen: (v: boolean) => void;
  setSession: (s: Session | null) => void;
}

const KEY = 'flatplan:sitemeasure:v1';

export const useSiteMeasure = create<SiteState>()((setState) => ({
  open: false,
  guideOpen: false,
  importOpen: false,
  session: null,
  setOpen: (v) => setState({ open: v }),
  setGuideOpen: (v) => setState({ guideOpen: v }),
  setImportOpen: (v) => setState({ importOpen: v }),
  setSession: (s) => {
    setState({ session: s });
    void set(KEY, s).catch(() => {});
  },
}));

export async function loadSession(): Promise<Session | null> {
  try {
    return ((await get<Session>(KEY)) as Session | undefined) ?? null;
  } catch {
    return null;
  }
}

export function countStatus(s: Session, st: StepStatus): number {
  return s.stepIds.filter((id) => s.status[id] === st).length;
}
