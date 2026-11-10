import { describe, expect, it } from 'vitest';
import type { Level } from '../model/types';
import { CATALOGUE } from './items';
import { itemParts, newPlacedItem, obstacleRects, footprint, effectiveDims } from './catalogue';
import { surroundLayout } from './builders';
import { blankLevel } from '../geometry/testUtils';
import { addWall, defaultWallProps } from '../geometry/wallGraph';
import { computeJoints } from '../geometry/joints';
import { makeOpening } from '../geometry/openings';
import { snapToOpening, fitSurround } from '../editor2d/itemOps';
import { makeContext } from '../rules/engine';
import { pointInPolygon } from '../geometry/vec';

const surround = CATALOGUE.find((c) => c.id === 'bookcase-surround')!;
const ofuro = CATALOGUE.find((c) => c.id === 'bath-japanese')!;

/** A 5 m by 4 m room; the top wall (y = 0) has a 1.2 m cased opening centred at x = 2500. */
function room(): { L: Level; wallId: string } {
  const L = blankLevel();
  const p = { ...defaultWallProps(), structural: 'nonLoadBearing' as const };
  const [top] = addWall(L, { x: 0, y: 0 }, { x: 5000, y: 0 }, p);
  addWall(L, { x: 5000, y: 0 }, { x: 5000, y: 4000 }, p);
  addWall(L, { x: 5000, y: 4000 }, { x: 0, y: 4000 }, p);
  addWall(L, { x: 0, y: 4000 }, { x: 0, y: 0 }, p);
  const w = L.walls.find((x) => x.id === top)!;
  w.openings.push({ ...makeOpening('opening', 1900, 1200), height: 2100 });
  return { L, wallId: top };
}

describe('bookcase surround', () => {
  it('keeps the gap the size of the opening when made wider or taller', () => {
    const it0 = { ...newPlacedItem(surround, { x: 0, y: 0 }), params: { gapW: 1200, gapH: 2100 } };
    const wide = { ...it0, dims: { w: 3400, d: 350, h: 3000 } };
    const lay = surroundLayout(wide, wide.dims);
    expect(lay.gapW).toBe(1200);
    expect(lay.gapH).toBe(2100);
    expect(lay.side).toBe(1100);
    // Nothing solid inside the gap below the head height.
    for (const p of itemParts(wide, surround)) {
      const bottom = p.pos[1] - p.size[1] / 2;
      const x0 = p.pos[0] - p.size[0] / 2;
      const x1 = p.pos[0] + p.size[0] / 2;
      const inGap = x1 > -600 + 1 && x0 < 600 - 1;
      if (inGap) expect(bottom).toBeGreaterThanOrEqual(2100 - 1);
    }
    // The bridge reaches the top.
    const top = Math.max(...itemParts(wide, surround).map((p) => p.pos[1] + p.size[1] / 2));
    expect(top).toBeGreaterThanOrEqual(3000 - 2);
  });

  it('snaps centred on an opening, sized to it, backed onto the wall', () => {
    const { L, wallId } = room();
    const J = computeJoints(L);
    const snap = snapToOpening(L, J, { x: 2300, y: 600 }, 350, 600, 600)!;
    expect(snap).toBeTruthy();
    expect(snap.gapW).toBe(1200);
    expect(snap.gapH).toBe(2100);
    expect(snap.pos.x).toBeCloseTo(2500, 6);
    expect(snap.pos.y).toBeCloseTo(50 + 175, 6); // wall face at 50, half depth 175
    expect(snap.mountedTo.wallId).toBe(wallId);
    const fitted = fitSurround(newPlacedItem(surround, snap.pos), snap, 600, L.ceilingHeight);
    expect(fitted.dims.w).toBe(2400);
    expect(fitted.dims.h).toBe(L.ceilingHeight - 50);
    // Back edge flush with the wall face.
    const fp = footprint(fitted, surround);
    expect(Math.min(...fp.map((p) => p.y))).toBeCloseTo(50, 6);
  });

  it('leaves the opening passable: rays go through the gap, but hit the towers', () => {
    const { L } = room();
    const J = computeJoints(L);
    const snap = snapToOpening(L, J, { x: 2500, y: 500 }, 350, 600, 600)!;
    L.items.push(fitSurround(newPlacedItem(surround, snap.pos), snap, 600, L.ceilingHeight));
    const ctx = makeContext(L, { catalogueOverrides: [] });
    const up = { x: 0, y: -1 };
    // From the room, straight at the middle of the opening: passes the surround and the cased opening.
    const through = ctx.cast({ x: 2500, y: 1500 }, up, null);
    expect(through.item).toBeUndefined();
    expect(through.dist).toBeGreaterThan(1500);
    // At a tower: stopped by the surround.
    const tower = ctx.cast({ x: 1600, y: 1500 }, up, null);
    expect(tower.item?.cat.id).toBe('bookcase-surround');
    expect(tower.dist).toBeCloseTo(1500 - 400, 0);
    // obstacleRects has nothing covering the middle of the gap.
    const rects = obstacleRects(L.items[0], surround);
    expect(rects.some((r) => pointInPolygon({ x: 2500, y: 150 }, r))).toBe(false);
  });
});

describe('Japanese soaking bath', () => {
  it('is square, deep, with water below the rim, and resizes in range', () => {
    const b = newPlacedItem(ofuro, { x: 0, y: 0 });
    expect(effectiveDims(b, ofuro)).toEqual({ w: 1100, d: 1100, h: 650 });
    const parts = itemParts(b, ofuro);
    const water = parts.find((p) => p.colorToken === 'water')!;
    expect(650 - (water.pos[1] + water.size[1] / 2)).toBeCloseTo(100, 0);
    expect(parts.some((p) => p.colorToken === 'hinoki')).toBe(true);
    expect(ofuro.resizable.w).toEqual([900, 1400]);
  });
});
