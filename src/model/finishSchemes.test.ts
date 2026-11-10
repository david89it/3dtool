import { describe, expect, it } from 'vitest';
import { applyScheme, makeScheme, roomFinishes } from './finishSchemes';
import { buildSeedProject } from './seed';
import { cloneLevel, duplicateAsOption } from './schemes';
import { setWallFace } from './faces';
import type { Level } from './types';

const room = (name: string, extra: object = {}) => ({ id: `r-${name}`, name, boundary: [], ...extra });

describe('finish schemes', () => {
  it('saves only what a room has set, keyed by room name', () => {
    const level = { rooms: [room('Reception', { floorFinish: 'floor-oak', ceilingFinish: '#eeeeee' }), room('Kitchen')] } as unknown as Level;
    const s = makeScheme(level, '  Calm  ');
    expect(s.name).toBe('Calm');
    expect(s.rooms.Reception).toEqual({ floor: 'floor-oak', ceiling: '#eeeeee' });
    expect(s.rooms.Kitchen).toEqual({});
    expect(roomFinishes(level.rooms[0])).toEqual(s.rooms.Reception);
  });

  it('applies by room name, clears what the scheme leaves out, and ignores unknown rooms', () => {
    const src = { rooms: [room('Reception', { floorFinish: 'floor-walnut', wallFinish: 'paint-sage', woodworkColor: '#5a2a3a' })] } as unknown as Level;
    const scheme = makeScheme(src, 'Dark floor');
    const target = {
      rooms: [room('Reception', { ceilingFinish: 'paint-blush', wallFinish: 'paint-olive' }), room('Bedroom 1', { floorFinish: 'floor-oak' })],
    } as unknown as Level;
    expect(applyScheme(target, scheme)).toBe(1);
    expect(target.rooms[0]).toMatchObject({ floorFinish: 'floor-walnut', wallFinish: 'paint-sage', woodworkColor: '#5a2a3a' });
    expect(target.rooms[0].ceilingFinish).toBeUndefined();
    expect(target.rooms[1].floorFinish).toBe('floor-oak');
  });

  it('applies to a duplicated option of the first floor', () => {
    const project = buildSeedProject();
    const first = project.levels.find((l) => l.name === 'First floor')!;
    const reception = first.rooms.find((r) => r.name === 'Reception')!;
    reception.wallFinish = 'paint-aubergine';
    reception.ceilingFinish = 'paint-blush';
    const scheme = makeScheme(first, 'Plum');
    const id = duplicateAsOption(project, first.id)!;
    const copy = project.levels.find((l) => l.id === id)!;
    // The copy starts with the same finishes; change them, then bring the scheme back.
    copy.rooms.find((r) => r.name === 'Reception')!.wallFinish = 'paint-sage';
    expect(applyScheme(copy, scheme)).toBeGreaterThan(0);
    expect(copy.rooms.find((r) => r.name === 'Reception')!.wallFinish).toBe('paint-aubergine');
    expect(copy.rooms.find((r) => r.name === 'Reception')!.ceilingFinish).toBe('paint-blush');
  });

  it('wall face paint is copied with a floor and cleared cleanly', () => {
    const project = buildSeedProject();
    const first = project.levels.find((l) => l.name === 'First floor')!;
    setWallFace(first.walls[0], 'L', '#5a2a3a');
    const copy = cloneLevel(first);
    expect(copy.walls[0].faces).toEqual({ L: '#5a2a3a' });
    setWallFace(copy.walls[0], 'L', undefined);
    expect(copy.walls[0].faces).toBeUndefined();
    expect(first.walls[0].faces).toEqual({ L: '#5a2a3a' });
  });
});
