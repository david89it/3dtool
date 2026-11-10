import { describe, expect, it } from 'vitest';
import { CATALOGUE } from './items';
import { effectiveDims, footprint, footprintCentre, itemParts, newPlacedItem, isFloorObstacle } from './catalogue';

const cat = (id: string) => CATALOGUE.find((c) => c.id === id)!;

describe('catalogue', () => {
  it('has at least 60 items with unique ids, and the must-have items', () => {
    expect(CATALOGUE.length).toBeGreaterThanOrEqual(60);
    expect(new Set(CATALOGUE.map((c) => c.id)).size).toBe(CATALOGUE.length);
    for (const id of ['bed-single', 'bed-double', 'bed-king', 'bed-murphy', 'bed-bunk', 'sofa-bed', 'sofa-2', 'sofa-3', 'armchair', 'sofa-corner', 'table-round', 'table-dining', 'table-extendable', 'desk', 'desk-foldown', 'wardrobe-hinged', 'wardrobe-sliding', 'cupboard-eaves', 'shelving-alcove', 'drawers-chest', 'utility-tall', 'utility-drawer', 'shoe-cabinet', 'kitchen-base-600', 'kitchen-wall', 'kitchen-tall', 'kitchen-sink', 'kitchen-hob', 'kitchen-oven', 'fridge-freezer', 'dishwasher', 'washer-dryer', 'kitchen-island', 'kitchen-peninsula', 'breakfast-bar', 'bath', 'shower-tray', 'basin', 'wc', 'towel-rail', 'radiator', 'boiler-cupboard', 'fireplace', 'chimney-breast', 'rug', 'lamp-floor', 'plant-large', 'tv-unit', 'piano-upright', 'bike-rack', 'bench-seat', 'bookcase-surround', 'bath-japanese']) {
      expect(cat(id), id).toBeTruthy();
    }
  });

  it('every item has parts and sane default sizes', () => {
    for (const c of CATALOGUE) {
      expect(c.geometry.length, c.id).toBeGreaterThan(0);
      expect(c.defaultDims.w, c.id).toBeGreaterThan(0);
    }
  });

  it('a deployed Murphy bed grows forward from the wall, back edge fixed', () => {
    const c = cat('bed-murphy');
    const it0 = newPlacedItem(c, { x: 1000, y: 225 }, 0); // back against y = 0
    expect(footprint(it0, c)[0].y).toBeCloseTo(0, 6);
    const dep = { ...it0, state: 'deployed' };
    expect(effectiveDims(dep, c).d).toBe(2150);
    expect(footprint(dep, c)[0].y).toBeCloseTo(0, 6);
    expect(footprintCentre(dep, c).y).toBeCloseTo(1075, 6);
  });

  it('scales parts when resized and rotates the footprint', () => {
    const c = cat('table-dining');
    const t = { ...newPlacedItem(c, { x: 0, y: 0 }, 90), dims: { w: 2000, d: 900, h: 750 } };
    const top = itemParts(t, c)[0];
    expect(top.size[0]).toBeCloseTo(2000, 6);
    const fp = footprint(t, c);
    const xs = fp.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(900, 6); // rotated 90: width runs along y
  });

  it('rugs and wall cupboards are not floor obstacles', () => {
    expect(isFloorObstacle(newPlacedItem(cat('rug'), { x: 0, y: 0 }), cat('rug'))).toBe(false);
    expect(isFloorObstacle(newPlacedItem(cat('kitchen-wall'), { x: 0, y: 0 }), cat('kitchen-wall'))).toBe(false);
    expect(isFloorObstacle(newPlacedItem(cat('sofa-3'), { x: 0, y: 0 }), cat('sofa-3'))).toBe(true);
  });
});
