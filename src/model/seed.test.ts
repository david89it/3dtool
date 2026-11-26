import { describe, expect, it } from 'vitest';
import { buildSeedProject, LEVEL_IDS } from './seed';
import { detectRooms } from '../geometry/rooms';

describe('seed project', () => {
  const p = buildSeedProject();
  it('has the five levels', () => {
    expect(p.levels.map((l) => l.name)).toEqual(['Ground floor', 'First floor', 'Half-landing', 'Second floor', 'Loft']);
  });
  it('has the named rooms with areas close to the agent plan', () => {
    const areas: Record<string, number> = {};
    for (const L of p.levels) {
      const det = detectRooms(L).filter((r) => !r.solid);
      for (const room of L.rooms) {
        const d = det.find((x) => x.nodeIds.join('|') === room.boundary.join('|'));
        areas[`${L.name}/${room.name}`] = (d?.area ?? 0) / 1e6;
      }
    }
    // Agent: kitchen 3.32 x 2.81 = 9.3, bathroom 2.25 x 2.18 = 4.9,
    // bedroom 2 3.35 x 2.81 = 9.4; reception and bedroom 1 lose a chimney breast.
    expect(areas['First floor/Kitchen']).toBeGreaterThan(8.5);
    expect(areas['First floor/Kitchen']).toBeLessThan(9.5);
    expect(areas['First floor/Reception']).toBeGreaterThan(15);
    expect(areas['Half-landing/Bathroom']).toBeCloseTo(4.9, 0);
    expect(areas['Second floor/Bedroom 2']).toBeGreaterThan(8.5);
    expect(areas['Second floor/Bedroom 1']).toBeGreaterThan(13);
    console.log(areas);
  });
  it('marks the kitchen/reception partition load-bearing and everything else unknown', () => {
    const first = p.levels[1];
    const lb = first.walls.filter((w) => w.structural === 'loadBearing');
    expect(lb.length).toBeGreaterThan(0);
    for (const L of p.levels)
      for (const w of L.walls) if (L !== first || !lb.includes(w)) expect(w.structural).toBe('unknown');
  });

  it('gives the loft a room with two estimated roof slopes, knee 900 mm and 35 degrees, on the front and back walls', () => {
    const loft = p.levels.find((l) => l.name === 'Loft')!;
    const room = loft.rooms.find((r) => r.name === 'Loft')!;
    expect(room.slopes).toHaveLength(2);
    const ys = room.slopes!.map((s) => {
      const w = loft.walls.find((x) => x.id === s.wallId)!;
      const a = loft.nodes.find((n) => n.id === w.a)!.pos;
      const b = loft.nodes.find((n) => n.id === w.b)!.pos;
      expect(a.y).toBe(b.y); // the front and back walls run across the plan
      expect(s.kneeHeight).toBe(900);
      expect(s.pitchDeg).toBe(35);
      expect(s.estimated).toEqual(['knee', 'pitch']);
      return a.y;
    });
    expect(ys.sort((x, y) => x - y)).toEqual([-165, 7065]);
    expect(loft.markers!.some((m) => /knee-wall height/.test(m.text))).toBe(true);
    // And a stair that comes up into it.
    expect(loft.stairs.some((s) => s.toLevelId === LEVEL_IDS.second)).toBe(true);
  });

  it('puts estimated chimney breast pieces where the solid masses are', () => {
    for (const id of [LEVEL_IDS.first, LEVEL_IDS.second]) {
      const L = p.levels.find((l) => l.id === id)!;
      const solids = detectRooms(L).filter((r) => r.solid);
      const chimneys = L.items.filter((i) => i.catalogueId === 'chimney-breast');
      expect(chimneys).toHaveLength(2);
      expect(solids.length).toBeGreaterThanOrEqual(2);
      for (const c of chimneys) {
        expect(c.estimated).toBe(true);
        expect(c.mountedTo).toBeTruthy();
        expect(c.dims.d).toBe(320);
        expect(c.dims.h).toBe(L.ceilingHeight);
        // It sits over one of the solid masses.
        expect(solids.some((s) => s.centre.every((q) => q.x < 320) && c.pos.y > Math.min(...s.centre.map((q) => q.y)) && c.pos.y < Math.max(...s.centre.map((q) => q.y)))).toBe(true);
      }
    }
  });
});
