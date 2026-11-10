import { describe, expect, it } from 'vitest';
import { diffProjects, diffProjectsAll } from './diffProjects';
import type { Level, PlacedItem, Project } from './types';

function item(id: string, x = 0, y = 0): PlacedItem {
  return { id, catalogueId: 'sofa', pos: { x, y }, rotationDeg: 0, dims: { w: 1000, d: 500, h: 500 } };
}

function level(over: Partial<Level> = {}): Level {
  return {
    id: 'L1',
    name: 'First floor',
    elevation: 0,
    ceilingHeight: 2500,
    nodes: [
      { id: 'n1', pos: { x: 0, y: 0 } },
      { id: 'n2', pos: { x: 3000, y: 0 } },
      { id: 'n3', pos: { x: 3000, y: 3000 } },
      { id: 'n4', pos: { x: 0, y: 3000 } },
    ],
    walls: [
      { id: 'w1', a: 'n1', b: 'n2', thickness: 100, kind: 'internal', structural: 'unknown', openings: [] },
      { id: 'w2', a: 'n2', b: 'n3', thickness: 100, kind: 'internal', structural: 'unknown', openings: [] },
      { id: 'w3', a: 'n3', b: 'n4', thickness: 100, kind: 'internal', structural: 'unknown', openings: [] },
      { id: 'w4', a: 'n4', b: 'n1', thickness: 100, kind: 'internal', structural: 'unknown', openings: [] },
    ],
    rooms: [{ id: 'r1', name: 'Kitchen', boundary: ['n1', 'n2', 'n3', 'n4'] }],
    items: [],
    stairs: [],
    ...over,
  };
}

const project = (levels: Level[] = [level()]): Project => ({ version: 1, name: 'Flat', levels, catalogueOverrides: [] });
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe('diffProjects', () => {
  it('says nothing when nothing changed', () => {
    expect(diffProjects(project(), clone(project()))).toEqual([]);
  });

  it('describes opening a wall, with its width and the room it is in', () => {
    const a = project();
    const b = clone(a);
    b.levels[0].walls[0].openings.push({ id: 'o1', type: 'opening', offset: 100, width: 2610, height: 2100, sill: 0 });
    expect(diffProjects(a, b)).toEqual(['First floor: Kitchen wall opened (2.61 m)']);
    expect(diffProjects(a, b, { units: 'imperial' })[0]).toMatch(/opened \(8′ 7″\)/);
  });

  it('describes doors added, resized, moved and removed', () => {
    const a = project();
    a.levels[0].walls[1].openings.push({ id: 'o1', type: 'door', offset: 500, width: 800, height: 2000, sill: 0 });
    const b = clone(a);
    b.levels[0].walls[1].openings[0].width = 900;
    expect(diffProjects(a, b)).toEqual(['First floor: Door in kitchen wall resized (80 cm to 90 cm)']);
    const c = clone(a);
    c.levels[0].walls[1].openings[0].offset = 900;
    expect(diffProjects(a, c)).toEqual(['First floor: Door in kitchen wall moved']);
    const d = clone(a);
    d.levels[0].walls[1].openings = [];
    expect(diffProjects(a, d)).toEqual(['First floor: Door removed from kitchen wall']);
    expect(diffProjects(d, a)[0]).toMatch(/Door added to kitchen wall/);
  });

  it('counts items added, moved and removed in one line', () => {
    const a = project([level({ items: [item('i1'), item('i2'), item('i3')] })]);
    const b = clone(a);
    // i1 moved, i2 and i3 removed, three new ones.
    b.levels[0].items = [item('i1', 400, 0), item('n1'), item('n2'), item('n3')];
    expect(diffProjects(a, b)).toEqual(['First floor: 3 items added, 1 moved, 2 removed']);
  });

  it('says "1 item moved" when that is all', () => {
    const a = project([level({ items: [item('i1')] })]);
    const b = clone(a);
    b.levels[0].items[0].rotationDeg = 90;
    expect(diffProjects(a, b)).toEqual(['First floor: 1 item moved']);
  });

  it('describes rooms renamed, added and removed', () => {
    const a = project();
    const b = clone(a);
    b.levels[0].rooms[0].name = 'Study';
    expect(diffProjects(a, b)).toEqual(["First floor: Room 'Kitchen' renamed to 'Study'"]);
    b.levels[0].rooms.push({ id: 'r2', name: 'Room 2', boundary: [] });
    expect(diffProjects(a, b)).toContain("First floor: Room 'Room 2' added");
    expect(diffProjects(b, a)).toContain("First floor: Room 'Room 2' removed");
  });

  it('describes a deleted wall by the room it bounded', () => {
    const a = project();
    const b = clone(a);
    b.levels[0].walls = b.levels[0].walls.filter((w) => w.id !== 'w3');
    expect(diffProjects(a, b)).toEqual(['First floor: Kitchen wall removed']);
  });

  it('describes moved walls, structural marks and thickness', () => {
    const a = project();
    const b = clone(a);
    b.levels[0].nodes[2].pos.x = 3400; // n3 moves: w2 and w3 move
    b.levels[0].walls[0].structural = 'loadBearing';
    b.levels[0].walls[3].thickness = 220;
    expect(diffProjectsAll(a, b)).toEqual([
      'First floor: Kitchen wall marked as load-bearing',
      'First floor: Kitchen wall thickness changed (10 cm to 22 cm)',
      'First floor: 2 walls moved or resized',
    ]);
  });

  it('describes floors added, removed and changed', () => {
    const a = project();
    const b = clone(a);
    b.levels.push(level({ id: 'L2', name: 'Loft' }));
    expect(diffProjects(a, b)).toEqual(["Floor 'Loft' added"]);
    expect(diffProjects(b, a)).toEqual(["Floor 'Loft' removed"]);
    const c = clone(a);
    c.levels[0].ceilingHeight = 2700;
    c.levels[0].name = 'Ground floor';
    expect(diffProjects(a, c)).toEqual(["Ground floor: Floor 'First floor' renamed to 'Ground floor'", 'Ground floor: Ceiling height changed (2.50 m to 2.70 m)']);
  });

  it('notices plan pictures and project-level changes', () => {
    const a = project();
    const b = clone(a);
    b.levels[0].underlay = { imageDataUrl: 'img:abc', scaleMmPerPx: 10, offset: { x: 0, y: 0 }, rotationDeg: 0, opacity: 0.5, locked: false };
    b.name = 'Our flat';
    expect(diffProjects(a, b)).toEqual(["Plan renamed from 'Flat' to 'Our flat'", 'First floor: Plan picture added']);
    const c = clone(b);
    c.levels[0].underlay!.imageDataUrl = 'img:def';
    expect(diffProjects(b, c)).toEqual(['First floor: Plan picture replaced']);
  });

  it('cuts long lists to 8 lines plus "and N more changes"', () => {
    const a = project();
    const b = clone(a);
    for (let i = 0; i < 12; i++) b.levels.push(level({ id: `X${i}`, name: `Floor ${i}` }));
    const out = diffProjects(a, b);
    expect(out).toHaveLength(9);
    expect(out[8]).toBe('and 4 more changes');
    expect(diffProjects(a, b, { max: 11 }).at(-1)).toBe('and 1 more change');
    expect(diffProjects(a, b, { max: 50 })).toHaveLength(12);
  });
});
