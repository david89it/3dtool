import { describe, expect, it } from 'vitest';
import type { Level } from '../model/types';
import { addWall, defaultWallProps, deleteWall } from './wallGraph';
import { detectRooms, syncRooms } from './rooms';
import { computeJoints } from './joints';
import { blankLevel } from './testUtils';


function box(level: Level, x0: number, y0: number, x1: number, y1: number, t = 100) {
  const p = { ...defaultWallProps('internal'), thickness: t };
  addWall(level, { x: x0, y: y0 }, { x: x1, y: y0 }, p);
  addWall(level, { x: x1, y: y0 }, { x: x1, y: y1 }, p);
  addWall(level, { x: x1, y: y1 }, { x: x0, y: y1 }, p);
  addWall(level, { x: x0, y: y1 }, { x: x0, y: y0 }, p);
}

describe('room detection', () => {
  it('finds one room in a closed box and measures internal faces', () => {
    const L = blankLevel();
    box(L, 0, 0, 4000, 3000);
    const rooms = detectRooms(L).filter((r) => !r.solid);
    expect(rooms).toHaveLength(1);
    // centreline 4000 x 3000, 100 mm walls: inside is 3900 x 2900
    expect(rooms[0].area).toBeCloseTo(3900 * 2900, -2);
  });

  it('finds two rooms either side of a shared wall', () => {
    const L = blankLevel();
    box(L, 0, 0, 6000, 3000);
    addWall(L, { x: 2000, y: 0 }, { x: 2000, y: 3000 }, defaultWallProps());
    const rooms = detectRooms(L).filter((r) => !r.solid);
    expect(rooms).toHaveLength(2);
    const areas = rooms.map((r) => r.area).sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo(1900 * 2900, -2);
    expect(areas[1]).toBeCloseTo(3900 * 2900, -2);
  });

  it('finds no room in an open chain, and ignores dangling walls', () => {
    const L = blankLevel();
    const p = defaultWallProps();
    addWall(L, { x: 0, y: 0 }, { x: 3000, y: 0 }, p);
    addWall(L, { x: 3000, y: 0 }, { x: 3000, y: 3000 }, p);
    addWall(L, { x: 3000, y: 3000 }, { x: 0, y: 3000 }, p);
    expect(detectRooms(L)).toHaveLength(0);
    box(L, 5000, 0, 8000, 3000);
    addWall(L, { x: 6000, y: 1000 }, { x: 7000, y: 1000 }, p); // free-standing stub inside
    expect(detectRooms(L).filter((r) => !r.solid)).toHaveLength(1);
  });

  it('treats a tiny loop as solid (chimney breast void)', () => {
    const L = blankLevel();
    box(L, 0, 0, 300, 1500, 100);
    const rooms = detectRooms(L);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].solid).toBe(true);
  });

  it('keeps room names when walls are split, and merges when a wall is removed', () => {
    const L = blankLevel();
    box(L, 0, 0, 6000, 3000);
    const [mid] = addWall(L, { x: 2000, y: 0 }, { x: 2000, y: 3000 }, defaultWallProps());
    syncRooms(L);
    expect(L.rooms).toHaveLength(2);
    L.rooms[0].name = 'Kitchen';
    L.rooms[1].name = 'Reception';
    // Splitting the outer wall elsewhere keeps both names.
    addWall(L, { x: 4000, y: 3000 }, { x: 4000, y: 3500 }, defaultWallProps());
    syncRooms(L);
    expect(L.rooms.map((r) => r.name).sort()).toEqual(['Kitchen', 'Reception']);
    // Opening up: one room, one of the old names survives.
    deleteWall(L, mid);
    syncRooms(L);
    expect(L.rooms).toHaveLength(1);
    expect(['Kitchen', 'Reception']).toContain(L.rooms[0].name);
  });

  it('mitres corners so the outline faces match the room', () => {
    const L = blankLevel();
    box(L, 0, 0, 4000, 3000, 200);
    const J = computeJoints(L);
    const faces = [...J.outlines.values()].map((o) => Math.min(o.faceL, o.faceR)).sort((a, b) => a - b);
    expect(faces[0]).toBeCloseTo(2800, 3);
    expect(faces[3]).toBeCloseTo(3800, 3);
  });
});
