import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  afterCopy,
  afterEdit,
  afterLater,
  cleanReminder,
  emptyReminder,
  shouldRemind,
  type ReminderState,
} from './copyReminder';

const T0 = Date.UTC(2026, 10, 1, 9, 0, 0);

function edited(n: number, at = T0, base: ReminderState = emptyReminder()): ReminderState {
  let s = base;
  for (let i = 0; i < n; i++) s = afterEdit(s, at);
  return s;
}

describe('save-a-copy reminder timing', () => {
  it('never shows on a blank plan, however old', () => {
    expect(shouldRemind(edited(500), T0 + 30 * DAY_MS, true)).toBe(false);
  });

  it('does not show with no edits', () => {
    expect(shouldRemind({ lastCopyAt: T0 - 30 * DAY_MS, edits: 0 }, T0, false)).toBe(false);
  });

  it('shows after 7 days with no copy (counted from the first edit)', () => {
    const s = edited(10);
    expect(shouldRemind(s, T0 + 6 * DAY_MS, false)).toBe(false);
    expect(shouldRemind(s, T0 + 7 * DAY_MS, false)).toBe(true);
  });

  it('counts 7 days from the last copy when there is one', () => {
    const s: ReminderState = { lastCopyAt: T0, edits: 10, since: T0 + 5 * DAY_MS };
    expect(shouldRemind(s, T0 + 6.9 * DAY_MS, false)).toBe(false);
    expect(shouldRemind(s, T0 + 7 * DAY_MS, false)).toBe(true);
  });

  it('a handful of edits is not enough for the time rule', () => {
    expect(shouldRemind(edited(2), T0 + 30 * DAY_MS, false)).toBe(false);
  });

  it('shows at 200 edits since the last copy, even the same day', () => {
    expect(shouldRemind(edited(199), T0, false)).toBe(false);
    expect(shouldRemind(edited(200), T0, false)).toBe(true);
  });

  it('Later hides it for 3 days, then it comes back', () => {
    const s = afterLater(edited(300), T0);
    expect(shouldRemind(s, T0 + 2.9 * DAY_MS, false)).toBe(false);
    expect(shouldRemind(s, T0 + 3 * DAY_MS, false)).toBe(true);
  });

  it('saving a copy resets the count and the clock', () => {
    const s = afterCopy(edited(300), T0 + DAY_MS);
    expect(s).toEqual({ lastCopyAt: T0 + DAY_MS, edits: 0 });
    expect(shouldRemind(s, T0 + 20 * DAY_MS, false)).toBe(false);
    const more = edited(5, T0 + 2 * DAY_MS, s);
    expect(shouldRemind(more, T0 + 7 * DAY_MS, false)).toBe(false);
    expect(shouldRemind(more, T0 + 8 * DAY_MS, false)).toBe(true);
  });

  it('cleans a damaged record', () => {
    expect(cleanReminder(null)).toEqual({ edits: 0 });
    expect(cleanReminder({ edits: -4, lastCopyAt: 'x', snoozedUntil: NaN })).toEqual({ edits: 0 });
    expect(cleanReminder({ edits: 7.9, lastCopyAt: 5, since: 3 })).toEqual({ edits: 7, lastCopyAt: 5, since: 3 });
  });
});
