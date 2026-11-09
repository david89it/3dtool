import { describe, expect, it } from 'vitest';
import { buildSeedProject } from './seed';
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
});
