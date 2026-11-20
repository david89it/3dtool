// Whether the Report a problem window is open, and where reports go on this device. The address
// typed into Settings lives in this browser only (its own IndexedDB key); it is not part of the
// plan, so it is never saved into a plan file or undone.

import { create } from 'zustand';
import { get, set, del } from 'idb-keyval';
import { isValidEmail } from './address';

const KEY = 'flatplan:report-to';

export async function loadReportTo(): Promise<string> {
  try {
    const v = await get<string>(KEY);
    return isValidEmail(v) ? v.trim() : '';
  } catch {
    return '';
  }
}

export async function saveReportTo(address: string): Promise<void> {
  const a = address.trim();
  if (!a) await del(KEY);
  else await set(KEY, a);
}

interface ReportUi {
  open: boolean;
  /** Set when the window was opened from the error screen. */
  from?: 'crash';
  setOpen: (open: boolean, from?: 'crash') => void;
  /** The address typed into Settings on this device ('' when none). */
  address: string;
  setAddress: (a: string) => void;
}

export const useReportUi = create<ReportUi>((setState) => ({
  open: false,
  from: undefined,
  setOpen: (open, from) => setState({ open, from: open ? from : undefined }),
  address: '',
  setAddress: (address) => setState({ address }),
}));
