import { describe, expect, it } from 'vitest';
import type { Level } from '../model/types';
import { addWall, defaultWallProps } from '../geometry/wallGraph';
import { computeJoints } from '../geometry/joints';
import { blankLevel } from '../geometry/testUtils';
import { CATALOGUE } from '../catalogue/items';
import { newPlacedItem } from '../catalogue/catalogue';
import {
  GUIDE_RANGE,
  alignSnap,
  clearanceLimits,
  computeMoveGuides,
  gapStatus,
  guideWorld,
  guidesForItem,
  itemRect,
  moveToGap,
  rayDistances,
  snapGap,
  type Obstacle,
} from './guides';

const cat = (id: string) => CATALOGUE.find((c) => c.id === id)!;
const box = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const wall = (id: string, x0: number, y0: number, x1: number, y1: number): Obstacle => ({ id, kind: 'wall', poly: box(x0, y0, x1, y1) });
const bySide = (g: ReturnType<typeof rayDistances>, s: string) => g.find((x) => x.side === s);
const noClr = { ...cat('sofa-3'), clearance: [] };

/** A 1000 x 500 piece centred on the origin, facing +y. */
const rect = () => itemRect({ ...newPlacedItem(cat('sofa-3'), { x: 0, y: 0 }), dims: { w: 1000, d: 500, h: 800 } }, cat('sofa-3'));

describe('ray distances', () => {
  it('measures to walls in all four directions for an axis-aligned piece', () => {
    const walls = [wall('n', -3000, -800, 3000, -700), wall('s', -3000, 900, 3000, 1000), wall('w', -900, -3000, -800, 3000), wall('e', 1200, -3000, 1300, 3000)];
    const g = rayDistances(rect(), walls);
    expect(bySide(g, 'front')!.gap).toBeCloseTo(650);
    expect(bySide(g, 'back')!.gap).toBeCloseTo(450);
    expect(bySide(g, 'left')!.gap).toBeCloseTo(300);
    expect(bySide(g, 'right')!.gap).toBeCloseTo(700);
    expect(bySide(g, 'front')!.kind).toBe('wall');
    expect(bySide(g, 'front')!.to.y).toBeCloseTo(900);
    expect(bySide(g, 'front')!.from.y).toBeCloseTo(250);
  });

  it('uses the piece own frame when it is turned 90°', () => {
    const it = { ...newPlacedItem(cat('sofa-3'), { x: 0, y: 0 }), dims: { w: 1000, d: 500, h: 800 }, rotationDeg: 90 };
    // Turned 90° clockwise its front faces -x (screen left).
    const g = rayDistances(itemRect(it, cat('sofa-3')), [wall('w', -1500, -3000, -1400, 3000)]);
    expect(bySide(g, 'front')!.gap).toBeCloseTo(1150);
    expect(bySide(g, 'back')).toBeUndefined();
  });

  it('measures along the turned axis at 30°', () => {
    const it = { ...newPlacedItem(cat('sofa-3'), { x: 0, y: 0 }), dims: { w: 1000, d: 500, h: 800 }, rotationDeg: 30 };
    const r = itemRect(it, cat('sofa-3'));
    const f = r.front;
    const x = r.xAxis;
    const p = { x: f.x * 1000, y: f.y * 1000 };
    const at = (a: number, b: number) => ({ x: p.x + x.x * a + f.x * b, y: p.y + x.y * a + f.y * b });
    const poly = [at(-4000, -50), at(4000, -50), at(4000, 50), at(-4000, 50)];
    const g = rayDistances(r, [{ id: 'w', kind: 'wall', poly }]);
    expect(bySide(g, 'front')!.gap).toBeCloseTo(1000 - 50 - 250, 3);
  });

  it('finds other pieces as obstacles and picks the nearest', () => {
    const g = rayDistances(rect(), [{ id: 'a', kind: 'item', poly: box(-300, 600, 300, 900) }, wall('s', -3000, 1500, 3000, 1600)]);
    const f = bySide(g, 'front')!;
    expect(f.kind).toBe('item');
    expect(f.targetId).toBe('a');
    expect(f.gap).toBeCloseTo(350);
  });

  it('ignores obstacles beside the piece and ones that touch or overlap', () => {
    const g = rayDistances(rect(), [
      { id: 'beside', kind: 'item', poly: box(500, 300, 900, 700) }, // flush at the right edge, ahead of it
      { id: 'touch', kind: 'item', poly: box(-100, 250, 100, 400) },
    ]);
    expect(bySide(g, 'front')).toBeUndefined();
    expect(g.every((x) => x.targetId !== 'beside')).toBe(true);
  });

  it('caps the range at 3 m', () => {
    expect(rayDistances(rect(), [wall('far', -3000, 3400, 3000, 3500)]).length).toBe(0);
    const near = rayDistances(rect(), [wall('ok', -3000, 3200, 3000, 3300)]);
    expect(bySide(near, 'front')!.gap).toBeCloseTo(2950);
    expect(GUIDE_RANGE).toBe(3000);
  });

  it('ignores pieces of the same group or selection', () => {
    const L: Level = blankLevel();
    addWall(L, { x: -3000, y: 1000 }, { x: 3000, y: 1000 }, defaultWallProps());
    const me = { ...newPlacedItem(cat('sofa-3'), { x: 0, y: 0 }), dims: { w: 1000, d: 500, h: 800 } };
    const mate = { ...newPlacedItem(cat('sofa-3'), { x: 0, y: 600 }), dims: { w: 1000, d: 500, h: 800 } };
    L.items.push(me, mate);
    const J = computeJoints(L);
    const proj = { catalogueOverrides: [] };
    const withMate = guideWorld(L, proj, J, [me.id]);
    expect(bySide(rayDistances(itemRect(me, cat('sofa-3')), withMate.obstacles), 'front')!.targetId).toBe(mate.id);
    const without = guideWorld(L, proj, J, [me.id, mate.id]);
    const f = bySide(rayDistances(itemRect(me, cat('sofa-3')), without.obstacles), 'front')!;
    expect(f.kind).toBe('wall');
    expect(f.gap).toBeCloseTo(1000 - 50 - 250);
    expect(guidesForItem(L, proj, J, me.id).find((g) => g.side === 'front')!.targetId).toBe(mate.id);
  });
});

describe('clearance colouring', () => {
  const clr = [{ side: 'front' as const, min: 450, ideal: 600, reason: '' }];
  it('red under the minimum, amber up to ideal, otherwise neutral', () => {
    const lim = clearanceLimits(clr, 'front');
    expect(gapStatus(300, lim)).toBe('tight');
    expect(gapStatus(450, lim)).toBe('low');
    expect(gapStatus(599, lim)).toBe('low');
    expect(gapStatus(600, lim)).toBe('ok');
    expect(gapStatus(10, clearanceLimits(clr, 'back'))).toBe('ok');
  });
  it('"all" applies to every side and the largest value wins', () => {
    const lim = clearanceLimits([{ side: 'all', min: 500, ideal: 700, reason: '' }, { side: 'left', min: 600, ideal: 650, reason: '' }], 'left');
    expect(lim).toEqual({ min: 600, ideal: 700 });
    expect(clearanceLimits([{ side: 'all', min: 500, ideal: 700, reason: '' }], 'back')).toEqual({ min: 500, ideal: 700 });
  });
  it('colours the guides from the catalogue', () => {
    const g = rayDistances(rect(), [wall('s', -3000, 500, 3000, 600)], clr); // front gap 250
    expect(bySide(g, 'front')!.status).toBe('tight');
  });
});

describe('snapping', () => {
  it('lines up an edge or centre with another piece within tolerance', () => {
    const r = rect(); // x edges -500, 500; centre 0
    const other = { id: 'o', poly: box(520, 800, 1000, 1100) }; // left edge 520: 20 mm off our right edge
    expect(alignSnap(r, [other], 30).dx).toBeCloseTo(20);
    expect(alignSnap(r, [other], 10).hitX).toBe(false);
    const centre2 = { id: 'c', poly: box(-100, 800, 120, 1100) }; // centre at 10
    expect(alignSnap(r, [centre2], 30).dx).toBeCloseTo(10);
  });

  it('respects the lock on an axis', () => {
    const other = { id: 'o', poly: box(-300, 270, 300, 600) }; // back edge at z 270 vs our front 250
    expect(alignSnap(rect(), [other], 30).dz).toBeCloseTo(20);
    expect(alignSnap(rect(), [other], 30, { z: true }).hitZ).toBe(false);
  });

  it('rounds the gap to 10 mm and to the clearance values when near', () => {
    expect(snapGap(447, null)).toBe(450);
    expect(snapGap(443, { min: 450, ideal: 600 })).toBe(450);
    expect(snapGap(585, { min: 450, ideal: 600 })).toBe(600);
    expect(snapGap(520, { min: 450, ideal: 600 })).toBe(520);
  });

  it('computeMoveGuides makes the wall gap round, and Alt turns it off', () => {
    const world = { obstacles: [wall('s', -3000, 593, 3000, 700)], targets: [] };
    const r = rect(); // front edge 250: gap 343
    const g = computeMoveGuides(r, noClr, world, { scale: 0.1, snap: true });
    expect(g.shift.y).toBeCloseTo(3, 5);
    expect(g.distances.find((d) => d.side === 'front')!.gap).toBeCloseTo(340);
    const off = computeMoveGuides(r, cat('sofa-3'), world, { scale: 0.1, snap: false });
    expect(off.shift).toEqual({ x: 0, y: 0 });
    expect(off.aligns).toEqual([]);
  });

  it('pulls to the clearance minimum when within 20 mm', () => {
    const world = { obstacles: [wall('s', -3000, 705, 3000, 800)], targets: [] };
    const sofa = { ...cat('sofa-3'), clearance: [{ side: 'front' as const, min: 450, ideal: 600, reason: '' }] };
    const g = computeMoveGuides(rect(), sofa, world, { scale: 0.1, snap: true }); // gap 455
    expect(g.distances.find((d) => d.side === 'front')!.gap).toBeCloseTo(450);
  });

  it('draws an alignment line and does not move a locked axis', () => {
    const world = { obstacles: [], targets: [{ id: 'o', poly: box(515, 800, 900, 1100) }] };
    const g = computeMoveGuides(rect(), noClr, world, { scale: 0.1, snap: true });
    expect(g.shift.x).toBeCloseTo(15);
    expect(g.aligns.length).toBe(1);
    const locked = computeMoveGuides(rect(), noClr, { obstacles: [], targets: [{ id: 'o', poly: box(-300, 262, 300, 600) }] }, { scale: 0.1, snap: true, lockZ: true });
    expect(locked.shift.y).toBe(0);
  });

  it('moveToGap moves along the side direction', () => {
    const it = { ...newPlacedItem(cat('sofa-3'), { x: 1000, y: 1000 }), rotationDeg: 0 };
    expect(moveToGap(it, 'front', 400, 600)).toEqual({ x: 1000, y: 800 });
    expect(moveToGap(it, 'right', 400, 100)).toEqual({ x: 1300, y: 1000 });
    expect(moveToGap({ ...it, rotationDeg: 90 }, 'front', 400, 300).x).toBeCloseTo(900, 5);
  });
});

describe('speed', () => {
  it('computes guides for 100 pieces well under a frame', () => {
    const L = blankLevel();
    addWall(L, { x: 0, y: 0 }, { x: 8000, y: 0 }, defaultWallProps());
    for (let i = 0; i < 100; i++) L.items.push(newPlacedItem(cat('chair-dining'), { x: (i % 10) * 700, y: 600 + Math.floor(i / 10) * 700 }));
    const J = computeJoints(L);
    const me = L.items[55];
    guidesForItem(L, { catalogueOverrides: [] }, J, me.id);
    const t = performance.now();
    for (let k = 0; k < 20; k++) guidesForItem(L, { catalogueOverrides: [] }, J, me.id);
    expect((performance.now() - t) / 20).toBeLessThan(8);
  });
});
