// Undo/redo as a stack of immer patches. Each entry remembers which level it
// happened on so undo can take her back there.

import type { Patch } from 'immer';
import type { Id } from './types';

export interface HistoryEntry {
  label: string;
  levelId: Id;
  patches: Patch[];
  inverse: Patch[];
}

export const HISTORY_LIMIT = 200;

export function pushEntry(past: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const next = [...past, entry];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}
