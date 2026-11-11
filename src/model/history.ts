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

/** One line of the undo history list. */
export interface HistoryRow {
  /** Plain-language label, first letter capitalised. */
  label: string;
  /** How many entries are applied when the plan is at this row (0 is the start). */
  target: number;
  /** The plan is exactly here now. */
  current: boolean;
  /** Undone already: clicking it redoes up to here. */
  undone: boolean;
}

export const HISTORY_LIST_SIZE = 30;

function sentence(label: string): string {
  const t = label.trim() || 'Change';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * The history as a list for the Undo dropdown: newest first, at most `limit` entries
 * (a window that always includes where the plan is now), then a "Start" row when the
 * whole history is shown. Entries she has undone sit above the current one.
 */
export function historyRows(past: { label: string }[], future: { label: string }[], limit = HISTORY_LIST_SIZE): HistoryRow[] {
  const timeline = [...past, ...[...future].reverse()];
  const here = past.length;
  const start = Math.max(0, Math.min(timeline.length - limit, here - 1));
  const end = Math.min(timeline.length, start + limit);
  const rows: HistoryRow[] = [];
  for (let i = end - 1; i >= start; i--) {
    rows.push({ label: sentence(timeline[i].label), target: i + 1, current: i + 1 === here, undone: i + 1 > here });
  }
  if (start === 0) rows.push({ label: 'Start (before any change)', target: 0, current: here === 0, undone: false });
  return rows;
}

/** Undo or redo steps needed to get from `here` applied entries to `target`. */
export function jumpPlan(here: number, target: number): { action: 'undo' | 'redo' | 'none'; count: number } {
  if (target < here) return { action: 'undo', count: here - target };
  if (target > here) return { action: 'redo', count: target - here };
  return { action: 'none', count: 0 };
}
