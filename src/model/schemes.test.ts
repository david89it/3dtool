import { describe, expect, it } from 'vitest';
import { buildSeedProject, LEVEL_IDS } from './seed';
import { activeLevels, activeLevelsResolved, cloneLevel, deleteOption, duplicateAsOption, optionsOf, resolveLevel, withActive } from './schemes';
import { detectRooms } from '../geometry/rooms';
import { deleteWall } from '../geometry/wallGraph';

describe('compare options', () => {
  it('clones a floor with fresh ids and an intact wall graph', () => {
    const p = buildSeedProject();
    const first = p.levels.find((l) => l.id === LEVEL_IDS.first)!;
    first.items.push({ id: 'it1', catalogueId: 'radiator', pos: { x: 0, y: 0 }, rotationDeg: 0, dims: { w: 1000, d: 110, h: 750 }, mountedTo: { wallId: first.walls[0].id, offset: 100 } });
    const c = cloneLevel(first);
    const oldIds = new Set([...first.nodes.map((n) => n.id), ...first.walls.map((w) => w.id), first.id]);
    for (const n of c.nodes) expect(oldIds.has(n.id)).toBe(false);
    for (const w of c.walls) {
      expect(oldIds.has(w.id)).toBe(false);
      expect(c.nodes.some((n) => n.id === w.a)).toBe(true);
      expect(c.nodes.some((n) => n.id === w.b)).toBe(true);
    }
    expect(c.walls.flatMap((w) => w.openings).length).toBe(first.walls.flatMap((w) => w.openings).length);
    expect(c.items[0].mountedTo!.wallId).toBe(c.walls[0].id);
    // Rooms still match their loops, so names survive.
    const det = detectRooms(c).filter((r) => !r.solid);
    for (const r of c.rooms) expect(det.some((d) => d.nodeIds.join('|') === r.boundary.join('|'))).toBe(true);
    expect(c.rooms.map((r) => r.name).sort()).toEqual(first.rooms.map((r) => r.name).sort());
  });

  it('duplicates as Option B, keeps one tab per floor, and resolves stairs to the active option', () => {
    const p = buildSeedProject();
    const nb = duplicateAsOption(p, LEVEL_IDS.first)!;
    const opts = optionsOf(p, LEVEL_IDS.first);
    expect(opts.map((o) => o.scheme!.name)).toEqual(['Option A', 'Option B']);
    expect(activeLevels(p).map((l) => l.name)).toEqual(['Ground floor', 'First floor', 'Half-landing', 'Second floor', 'Loft']);
    expect(activeLevels(p)[1].id).toBe(nb);
    // The ground floor stair leads to the first floor group: now Option B.
    expect(resolveLevel(p, LEVEL_IDS.first)!.id).toBe(nb);
    const ground = activeLevelsResolved(p)[0];
    expect(ground.stairs[0].toLevelId).toBe(nb);
    // Switching back to A.
    const back = withActive(p, LEVEL_IDS.first);
    expect(activeLevels(back)[1].id).toBe(LEVEL_IDS.first);
  });

  it('options are independent, and deleting leaves a plain floor', () => {
    const p = buildSeedProject();
    const nb = duplicateAsOption(p, LEVEL_IDS.first)!;
    const b = p.levels.find((l) => l.id === nb)!;
    const a = p.levels.find((l) => l.id === LEVEL_IDS.first)!;
    deleteWall(b, b.walls[0].id);
    expect(b.walls.length).toBe(a.walls.length - 1);
    expect(deleteOption(p, nb)).toBe(LEVEL_IDS.first);
    expect(p.levels.find((l) => l.id === LEVEL_IDS.first)!.scheme).toBeUndefined();
    expect(deleteOption(p, LEVEL_IDS.first)).toBeNull(); // never the last one
  });
});
