// "Save a copy" reminder. The whole plan lives in one browser's storage, so now and then she is asked to
// keep a copy in her files. This file holds the timing rules (pure) and the per-browser record
// (IndexedDB, its own key). The banner is `ui/CopyReminder.tsx`.

import { create } from 'zustand';
import { get, set } from 'idb-keyval';
import { useStore } from './store';
import { isEditorTab, onTakenOver } from './tabLock';

export const REMINDER_KEY = 'flatplan:copyreminder:v1';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const REMIND_AFTER_DAYS = 7;
export const REMIND_AFTER_EDITS = 200;
export const SNOOZE_DAYS = 3;
/** A few small edits are not worth a reminder when the time limit is the reason. */
export const MIN_EDITS_FOR_TIME = 5;

export interface ReminderState {
  /** When she last saved a copy from this browser. */
  lastCopyAt?: number;
  /** Do not show the banner before this time ("Later"). */
  snoozedUntil?: number;
  /** Edits since the last copy. */
  edits: number;
  /** Time of the first edit since the last copy; counts as the start when no copy was ever made. */
  since?: number;
}

export const emptyReminder = (): ReminderState => ({ edits: 0 });

/** Should the banner show? Never on a blank plan, and never while snoozed. */
export function shouldRemind(s: ReminderState, now: number, blank: boolean): boolean {
  if (blank || s.edits <= 0) return false;
  if (s.snoozedUntil !== undefined && now < s.snoozedUntil) return false;
  if (s.edits >= REMIND_AFTER_EDITS) return true;
  const start = s.lastCopyAt ?? s.since;
  return s.edits >= MIN_EDITS_FOR_TIME && start !== undefined && now - start >= REMIND_AFTER_DAYS * DAY_MS;
}

export function afterEdit(s: ReminderState, now: number): ReminderState {
  return { ...s, edits: s.edits + 1, since: s.since ?? now };
}

export function afterCopy(_s: ReminderState, now: number): ReminderState {
  return { lastCopyAt: now, edits: 0 };
}

export function afterLater(s: ReminderState, now: number): ReminderState {
  return { ...s, snoozedUntil: now + SNOOZE_DAYS * DAY_MS };
}

/** Make whatever was stored usable: numbers only, edits never negative. */
export function cleanReminder(x: unknown): ReminderState {
  if (!x || typeof x !== 'object') return emptyReminder();
  const r = x as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  const out: ReminderState = { edits: Math.floor(n(r.edits) ?? 0) };
  const last = n(r.lastCopyAt);
  const snooze = n(r.snoozedUntil);
  const since = n(r.since);
  if (last !== undefined) out.lastCopyAt = last;
  if (snooze !== undefined) out.snoozedUntil = snooze;
  if (since !== undefined) out.since = since;
  return out;
}

/* ---- running in the app ------------------------------------------------ */

interface ReminderStore {
  state: ReminderState;
}
export const useReminder = create<ReminderStore>(() => ({ state: emptyReminder() }));

let writeTimer: ReturnType<typeof setTimeout> | undefined;

async function write(): Promise<void> {
  writeTimer = undefined;
  // Only the editing tab writes, so a tab that is only looking cannot put an old record over a newer one.
  if (!isEditorTab()) return;
  try {
    await set(REMINDER_KEY, useReminder.getState().state);
  } catch {
    // A reminder is a convenience; the plan is what matters.
  }
}

function update(fn: (s: ReminderState) => ReminderState): void {
  useReminder.setState((cur) => ({ state: fn(cur.state) }));
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => void write(), 1500);
}

export async function loadReminder(): Promise<void> {
  try {
    useReminder.setState({ state: cleanReminder(await get(REMINDER_KEY)) });
  } catch {
    useReminder.setState({ state: emptyReminder() });
  }
}

/** She saved a copy (File, Save a copy, or the banner). */
export function noteCopySaved(now = Date.now()): void {
  update((s) => afterCopy(s, now));
  if (writeTimer) clearTimeout(writeTimer);
  void write();
}

export function snoozeReminder(now = Date.now()): void {
  update((s) => afterLater(s, now));
}

/** Count edits from the store. Returns a function that stops counting. */
export function startCopyReminder(): () => void {
  void loadReminder();
  onTakenOver(loadReminder);
  return useStore.subscribe((s, prev) => {
    if (!s.ready || s.loadSeq !== prev.loadSeq || !isEditorTab()) return;
    // A new undo entry means one edit (a drag counts once, when it ends).
    if (s.past !== prev.past && s.past.length >= prev.past.length && s.past[s.past.length - 1] !== prev.past[prev.past.length - 1]) {
      update((r) => afterEdit(r, Date.now()));
    }
  });
}
