import { describe, expect, it } from 'vitest';
import type { Level, Wall } from '../model/types';
import { addWall, defaultWallProps } from './wallGraph';
import { computeJoints } from './joints';
import { blankLevel } from './testUtils';
import {
  allowedOffsets,
  endDistances,
  fitOpening,
  hitOpening,
  largestGap,
  makeOpening,
  MIN_NIB,
  needsStructuralBadge,
  nibShortfall,
  usableRange,
} from './openings';

/** A 4 m wall (centreline) between two 100 mm walls: inside faces at 50 and 3950. */
function setup(structural: Wall['structural'] = 'nonLoadBearing') {
  const L: Level = blankLevel();
  const p = { ...defaultWallProps(), structural };
  addWall(L, { x: 0, y: -1000 }, { x: 0, y: 1000 }, p);
  addWall(L, { x: 4000, y: -1000 }, { x: 4000, y: 1000 }, p);
  const [id] = addWall(L, { x: 0, y: 0 }, { x: 4000, y: 0 }, p);
  const w = L.walls.find((x) => x.id === id)!;
  const J = computeJoints(L);
  return { L, w, J, range: usableRange(J, id)! };
}

describe('opening placement', () => {
  it('stops at the inside faces of the walls at each end', () => {
    const { range } = setup();
    expect(range.start).toBeCloseTo(50, 6);
    expect(range.end).toBeCloseTo(3950, 6);
  });

  it('snaps along the wall and cannot run past a wall end', () => {
    const { w, range } = setup();
    expect(fitOpening(w, range, 2000, 800)).toBe(1600);
    expect(fitOpening(w, range, 3900, 800)).toBe(3150); // pushed back inside
    expect(fitOpening(w, range, -500, 800)).toBe(50);
  });

  it('cannot overlap another opening; slides to the nearest free spot', () => {
    const { w, range } = setup();
    w.openings.push({ ...makeOpening('door', 1600), width: 800 });
    const off = fitOpening(w, range, 2000, 800)!;
    expect(off + 800 <= 1600 || off >= 2400).toBe(true);
    const fits = allowedOffsets(w, range, 3000);
    expect(fits).toHaveLength(0); // a 3 m opening no longer fits anywhere
    expect(fitOpening(w, range, 2000, 3000)).toBeNull();
  });

  it('keeps 100 mm piers in a structural wall', () => {
    const { w, range } = setup('unknown');
    expect(fitOpening(w, range, 0, 800)).toBe(50 + MIN_NIB);
    const gap = largestGap(w, range)!;
    expect(gap.offset).toBe(150);
    expect(gap.width).toBe(3700);
  });

  it('allows narrower piers when she overrides, and still reports it', () => {
    const { w, range } = setup('loadBearing');
    const o = { ...makeOpening('opening', 50, 3900), nibOverride: true };
    w.openings.push(o);
    expect(fitOpening(w, range, 2000, 3900, { excludeId: o.id, nib: 0 })).toBe(50);
    expect(nibShortfall(w, range, o)).toBe(true);
    expect(endDistances(range, o)).toEqual({ before: 0, after: 0 });
  });

  it('flags new openings in structural walls, not existing ones', () => {
    const { w } = setup('unknown');
    w.openings.push({ ...makeOpening('door', 1000), existing: true });
    expect(needsStructuralBadge(w)).toBe(false);
    w.openings.push(makeOpening('opening', 2000));
    expect(needsStructuralBadge(w)).toBe(true);
    w.structural = 'nonLoadBearing';
    expect(needsStructuralBadge(w)).toBe(false);
  });

  it('finds the opening under the pointer', () => {
    const { L, w } = setup();
    const o = makeOpening('window', 1000);
    w.openings.push(o);
    const J = computeJoints(L);
    expect(hitOpening(L, J, { x: 1500, y: 20 }, 10)?.opening.id).toBe(o.id);
    expect(hitOpening(L, J, { x: 2500, y: 20 }, 10)).toBeUndefined();
  });
});
