import { describe, expect, it } from 'vitest';
import type { Level } from '../model/types';
import { addWall, defaultWallProps } from '../geometry/wallGraph';
import { computeJoints } from '../geometry/joints';
import { blankLevel } from '../geometry/testUtils';
import { CATALOGUE } from '../catalogue/items';
import { effectiveDims, footprint, newPlacedItem } from '../catalogue/catalogue';
import { duplicateItem, resizeFromEdge, rotateBy, rotationFacing, setDimension, snapToWall, wallFaces } from './itemOps';
import { clearanceShapes, leafCount } from './clearanceShapes';

const cat = (id: string) => CATALOGUE.find((c) => c.id === id)!;

/** One 100 mm wall along y = 0 from x 0 to 4000: faces at y = -50 and y = +50. */
function wallLevel(): Level {
  const L = blankLevel();
  addWall(L, { x: 0, y: 0 }, { x: 4000, y: 0 }, defaultWallProps());
  return L;
}

describe('furniture snapping and edits', () => {
  it('rotationFacing turns the front to face along the normal', () => {
    expect(rotationFacing({ x: 0, y: 1 })).toBe(0);
    expect(rotationFacing({ x: 0, y: -1 })).toBe(180);
    expect(rotationFacing({ x: 1, y: 0 })).toBe(270);
  });

  it('snaps an item back-flush against the nearest wall face and turns it', () => {
    const L = wallLevel();
    const faces = wallFaces(L, computeJoints(L));
    const sofa = cat('sofa-3');
    const s = snapToWall(faces, { x: 2000, y: 800 }, 90, sofa.defaultDims, { tol: 600, autoRotate: true })!;
    expect(s.rotationDeg).toBe(0);
    expect(s.pos.y).toBeCloseTo(50 + 950 / 2, 6);
    const placed = { ...newPlacedItem(sofa, s.pos, s.rotationDeg) };
    expect(Math.min(...footprint(placed, sofa).map((p) => p.y))).toBeCloseTo(50, 6);
    // Same from the other side: faces the other way.
    const s2 = snapToWall(faces, { x: 2000, y: -700 }, 0, sofa.defaultDims, { tol: 600, autoRotate: true })!;
    expect(s2.rotationDeg).toBe(180);
  });

  it('does not snap when too far, or when not parallel without auto-rotate', () => {
    const L = wallLevel();
    const faces = wallFaces(L, computeJoints(L));
    const sofa = cat('sofa-3');
    expect(snapToWall(faces, { x: 2000, y: 2500 }, 0, sofa.defaultDims, { tol: 600, autoRotate: true })).toBeNull();
    expect(snapToWall(faces, { x: 2000, y: 600 }, 90, sofa.defaultDims, { tol: 600, autoRotate: false })).toBeNull();
  });

  it('resizes from an edge within the catalogue range, keeping the other edge fixed', () => {
    const sofa = cat('sofa-3'); // w 1900..2500
    const it0 = newPlacedItem(sofa, { x: 0, y: 0 }, 0);
    const leftBefore = Math.min(...footprint(it0, sofa).map((p) => p.x));
    const big = resizeFromEdge(it0, sofa, 'right', 9000);
    expect(big.dims.w).toBe(2500);
    expect(Math.min(...footprint(big, sofa).map((p) => p.x))).toBeCloseTo(leftBefore, 6);
    const backBefore = Math.min(...footprint(it0, sofa).map((p) => p.y));
    const deeper = resizeFromEdge(it0, sofa, 'front', 1000);
    expect(deeper.dims.d).toBe(1000);
    expect(Math.min(...footprint(deeper, sofa).map((p) => p.y))).toBeCloseTo(backBefore, 6);
    // Fixed-size items don't change.
    const wc = cat('wc');
    const w0 = newPlacedItem(wc, { x: 0, y: 0 });
    expect(setDimension(w0, wc, 'w', 900).dims.w).toBe(400);
  });

  it('duplicates as a new unlocked item next to the original', () => {
    const t = { ...newPlacedItem(cat('desk'), { x: 1000, y: 1000 }), locked: true };
    const d = duplicateItem(t);
    expect(d.id).not.toBe(t.id);
    expect(d.locked).toBe(false);
    expect(d.pos).toEqual({ x: 1300, y: 1300 });
  });

  it('switching state keeps the back edge put, also after a turn', () => {
    const c = cat('bed-murphy');
    const it0 = rotateBy(newPlacedItem(c, { x: 1000, y: 1000 }), 90);
    const back0 = footprint(it0, c).slice(0, 2);
    const dep = { ...it0, state: 'deployed' };
    const back1 = footprint(dep, c).slice(0, 2);
    expect(back1[0].x).toBeCloseTo(back0[0].x, 6);
    expect(back1[0].y).toBeCloseTo(back0[0].y, 6);
    expect(effectiveDims(dep, c).d).toBe(2150);
  });

  it('draws hinged-door arcs, drawer pulls and the folded-down outline', () => {
    expect(leafCount(600)).toBe(1);
    expect(leafCount(1000)).toBe(2);
    expect(leafCount(1800)).toBe(3);
    const ward = clearanceShapes(newPlacedItem(cat('wardrobe-hinged'), { x: 0, y: 0 }), cat('wardrobe-hinged'));
    expect(ward.filter((s) => s.kind === 'swing')).toHaveLength(2);
    const murphy = clearanceShapes(newPlacedItem(cat('bed-murphy'), { x: 0, y: 0 }), cat('bed-murphy'));
    const outline = murphy.find((s) => s.kind === 'outline')!;
    const ys = outline.poly.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2150, 6);
    const chest = clearanceShapes(newPlacedItem(cat('drawers-chest'), { x: 0, y: 0 }), cat('drawers-chest'));
    expect(chest.some((s) => s.kind === 'outline')).toBe(true);
  });
});
