import { describe, expect, it } from 'vitest';
import type { Level, Wall } from '../model/types';
import { addWall, defaultWallProps } from './wallGraph';
import { blankLevel } from './testUtils';
import { addOpening, editOpening, moveOpening, openUpWall } from './openingEdits';
import { findOpening } from './openings';

const fmt = (mm: number) => `${mm} mm`;

/** Two 4 m walls in an L; the first runs x 0..4000 between end walls. */
function setup(structural: Wall['structural'] = 'unknown') {
  const L: Level = blankLevel();
  const p = { ...defaultWallProps(), structural };
  addWall(L, { x: 0, y: -1000 }, { x: 0, y: 1000 }, p);
  addWall(L, { x: 4000, y: -1000 }, { x: 4000, y: 1000 }, p);
  const [a] = addWall(L, { x: 0, y: 0 }, { x: 4000, y: 0 }, p);
  return { L, a };
}

describe('opening edits', () => {
  it('opens up a structural wall leaving 100 mm piers, and marks it new', () => {
    const { L, a } = setup();
    const r = openUpWall(L, a);
    expect('id' in r).toBe(true);
    const o = findOpening(L, (r as { id: string }).id)!.opening;
    expect(o.offset).toBe(150);
    expect(o.width).toBe(3700);
    expect(o.existing).toBeFalsy();
  });

  it('refuses a width that does not fit, keeps the old one', () => {
    const { L, a } = setup();
    const { id } = addOpening(L, a, 'door', 2000) as { id: string };
    expect(editOpening(L, id, 'width', 3900, fmt)).toMatch(/too wide/);
    expect(findOpening(L, id)!.opening.width).toBe(800);
    expect(editOpening(L, id, 'width', 1200, fmt)).toBeNull();
    expect(findOpening(L, id)!.opening.width).toBe(1200);
  });

  it('enforces the pier unless overridden', () => {
    const { L, a } = setup();
    const { id } = addOpening(L, a, 'opening', 2000) as { id: string };
    expect(editOpening(L, id, 'before', 50, fmt)).toMatch(/at least/);
    findOpening(L, id)!.opening.nibOverride = true;
    expect(editOpening(L, id, 'before', 50, fmt)).toBeNull();
    expect(findOpening(L, id)!.opening.offset).toBe(100); // inside face at 50 + 50
  });

  it('no pier needed in a wall confirmed non-load-bearing', () => {
    const { L, a } = setup('nonLoadBearing');
    const { id } = addOpening(L, a, 'door', 0) as { id: string };
    expect(findOpening(L, id)!.opening.offset).toBe(50);
  });

  it('moves an opening onto another wall, or refuses if it does not fit', () => {
    const { L, a } = setup('nonLoadBearing');
    const [b] = addWall(L, { x: 4000, y: 1000 }, { x: 4300, y: 1000 }, defaultWallProps());
    const { id } = addOpening(L, a, 'door', 2000) as { id: string };
    expect(moveOpening(L, id, b, 150)).toBe(false); // the short wall is too short
    expect(findOpening(L, id)!.wall.id).toBe(a);
    const c = L.walls.find((w) => w.id !== a && w.id !== b)!; // an end wall, 2 m long
    expect(moveOpening(L, id, c.id, 1000)).toBe(true);
    expect(findOpening(L, id)!.wall.id).toBe(c.id);
  });

  it('moving or widening an existing opening makes it a new structural opening', () => {
    const { L, a } = setup();
    const { id } = addOpening(L, a, 'door', 2000) as { id: string };
    findOpening(L, id)!.opening.existing = true;
    editOpening(L, id, 'height', 1900, fmt);
    expect(findOpening(L, id)!.opening.existing).toBe(true);
    editOpening(L, id, 'width', 900, fmt);
    expect(findOpening(L, id)!.opening.existing).toBe(false);
  });
});
