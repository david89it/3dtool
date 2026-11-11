import { describe, expect, it } from 'vitest';
import { historyRows, jumpPlan } from './history';

const e = (label: string) => ({ label });

describe('historyRows', () => {
  it('lists newest first with the current position marked and a start row', () => {
    const rows = historyRows([e('move wall'), e('Add door')], []);
    expect(rows.map((r) => r.label)).toEqual(['Add door', 'Move wall', 'Start (before any change)']);
    expect(rows.map((r) => r.current)).toEqual([true, false, false]);
    expect(rows.map((r) => r.target)).toEqual([2, 1, 0]);
  });

  it('puts undone entries above the current one, newest first', () => {
    // timeline: a, b, c, d; two applied (future is kept with the next redo last)
    const rows = historyRows([e('a'), e('b')], [e('d'), e('c')]);
    expect(rows.map((r) => r.label.charAt(0))).toEqual(['D', 'C', 'B', 'A', 'S']);
    expect(rows.map((r) => r.undone)).toEqual([true, true, false, false, false]);
    expect(rows.find((r) => r.current)?.label).toBe('B');
  });

  it('keeps at most 30 rows and keeps the current one in view', () => {
    const past = Array.from({ length: 100 }, (_, i) => e(`step ${i}`));
    const rows = historyRows(past, []);
    expect(rows).toHaveLength(30);
    expect(rows[0].label).toBe('Step 99');
    expect(rows.some((r) => r.label.startsWith('Start'))).toBe(false);
    // Far back in time: the window moves down to include the current entry.
    const back = historyRows(past.slice(0, 10), past.slice(10).reverse());
    expect(back).toHaveLength(30);
    expect(back.some((r) => r.current)).toBe(true);
  });

  it('marks the start row current when everything is undone', () => {
    const rows = historyRows([], [e('a')]);
    expect(rows.map((r) => r.current)).toEqual([false, true]);
  });
});

describe('jumpPlan', () => {
  it('counts the undo and redo steps', () => {
    expect(jumpPlan(5, 2)).toEqual({ action: 'undo', count: 3 });
    expect(jumpPlan(2, 5)).toEqual({ action: 'redo', count: 3 });
    expect(jumpPlan(4, 4)).toEqual({ action: 'none', count: 0 });
  });
});
