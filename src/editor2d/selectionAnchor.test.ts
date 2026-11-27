import { describe, expect, it } from 'vitest';
import type { Project } from '../model/types';
import { addWall, defaultWallProps } from '../geometry/wallGraph';
import { blankLevel } from '../geometry/testUtils';
import { newPlacedItem } from '../catalogue/catalogue';
import { CATALOGUE } from '../catalogue/items';
import { makeOpening } from '../geometry/openings';
import { selectionBox } from './selectionAnchor';

const project = { catalogueOverrides: [] } as unknown as Project;

describe('selectionBox', () => {
  it('has no box for nothing, or an id that is not on the floor', () => {
    const L = blankLevel();
    expect(selectionBox(L, project, null)).toBeNull();
    expect(selectionBox(L, project, { kind: 'item', id: 'nope' })).toBeNull();
    expect(selectionBox(L, project, { kind: 'wall', id: 'nope' })).toBeNull();
  });

  it('wraps a piece of furniture', () => {
    const L = blankLevel();
    const sofa = newPlacedItem(CATALOGUE.find((c) => c.id === 'sofa-3')!, { x: 1000, y: 1000 });
    L.items.push(sofa);
    const b = selectionBox(L, project, { kind: 'item', id: sofa.id })!;
    expect(b.min.x).toBeLessThan(1000);
    expect(b.max.x).toBeGreaterThan(1000);
    expect((b.min.x + b.max.x) / 2).toBeCloseTo(1000);
  });

  it('wraps several pieces together', () => {
    const L = blankLevel();
    const a = newPlacedItem(CATALOGUE.find((c) => c.id === 'sofa-3')!, { x: 0, y: 0 });
    const b = newPlacedItem(CATALOGUE.find((c) => c.id === 'sofa-3')!, { x: 3000, y: 0 });
    L.items.push(a, b);
    const box = selectionBox(L, project, { kind: 'items', ids: [a.id, b.id] })!;
    expect(box.min.x).toBeLessThan(-500);
    expect(box.max.x).toBeGreaterThan(3500);
  });

  it('puts a wall and an opening on the wall line', () => {
    const L = blankLevel();
    addWall(L, { x: 0, y: 0 }, { x: 4000, y: 0 }, defaultWallProps());
    const wall = L.walls[0];
    const o = makeOpening('door', 1000, 800);
    wall.openings.push(o);
    const wb = selectionBox(L, project, { kind: 'wall', id: wall.id })!;
    expect(wb.min.x).toBe(0);
    expect(wb.max.x).toBe(4000);
    const ob = selectionBox(L, project, { kind: 'opening', id: o.id })!;
    expect(ob.min.x).toBe(1400);
    expect(ob.min.y).toBe(0);
  });
});
