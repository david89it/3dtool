import { describe, expect, it } from 'vitest';
import type { Level } from '../model/types';
import { addWall, defaultWallProps } from '../geometry/wallGraph';
import { blankLevel } from '../geometry/testUtils';
import { makeOpening } from '../geometry/openings';
import { wallEndExtensions, wallProfile } from './wallProfile';
import { floorHeightAt, levelObstacles, levelUnderFeet, rampHeight, resolveCollision, stairRamps, PLAYER_RADIUS } from './walkPhysics';

function lvl(id: string, elevation: number): Level {
  return { ...blankLevel(), id, name: id, elevation };
}

describe('wall profile', () => {
  it('cuts a hole per opening matching its offset, width, sill and height', () => {
    const win = { ...makeOpening('window', 1000, 1200), sill: 900, height: 1200 };
    const door = { ...makeOpening('door', 3000, 800), height: 2000 };
    const p = wallProfile(4000, 2700, [win, door]);
    expect(p.outer).toEqual({ u0: 0, u1: 4000, v0: 0, v1: 2700 });
    expect(p.holes).toHaveLength(2);
    expect(p.holes[0]).toMatchObject({ u0: 1000, u1: 2200, v0: 900, v1: 2100, openingId: win.id });
    expect(p.holes[1]).toMatchObject({ u0: 3000, u1: 3800, v1: 2000, openingId: door.id });
  });

  it('clips holes so they never touch the outline', () => {
    const big = { ...makeOpening('opening', 0, 4000), height: 3000 };
    const p = wallProfile(4000, 2700, [big]);
    const h = p.holes[0];
    expect(h.u0).toBeGreaterThan(p.outer.u0);
    expect(h.u1).toBeLessThan(p.outer.u1);
    expect(h.v1).toBeLessThan(p.outer.v1);
    expect(h.v0).toBeGreaterThan(0);
  });

  it('extends wall ends at corners but not through a straight run', () => {
    const L = blankLevel();
    const ext = { ...defaultWallProps('external') }; // 330
    const [top] = addWall(L, { x: 0, y: 0 }, { x: 4000, y: 0 }, ext);
    addWall(L, { x: 0, y: 0 }, { x: 0, y: 3000 }, ext);
    addWall(L, { x: 4000, y: 0 }, { x: 8000, y: 0 }, ext); // straight on
    const e = wallEndExtensions(L, L.walls.find((w) => w.id === top)!);
    expect(e.extA).toBe(165);
    expect(e.extB).toBe(0);
  });
});

describe('walk physics', () => {
  it('pushes the player out of a wall to radius + half thickness', () => {
    const L = blankLevel();
    addWall(L, { x: 0, y: 0 }, { x: 4000, y: 0 }, defaultWallProps());
    const obs = levelObstacles(L, { catalogueOverrides: [] });
    const q = resolveCollision({ x: 2000, y: 100 }, obs);
    expect(q.y).toBeCloseTo(PLAYER_RADIUS + 50, 6);
  });

  it('lets the player through a door gap but not through a window', () => {
    const L = blankLevel();
    const [id] = addWall(L, { x: 0, y: 0 }, { x: 4000, y: 0 }, defaultWallProps());
    const w = L.walls.find((x) => x.id === id)!;
    w.openings.push({ ...makeOpening('door', 1500, 900) });
    w.openings.push({ ...makeOpening('window', 3000, 900) });
    const obs = levelObstacles(L, { catalogueOverrides: [] });
    expect(resolveCollision({ x: 1950, y: 0 }, obs)).toEqual({ x: 1950, y: 0 });
    expect(Math.abs(resolveCollision({ x: 3450, y: 10 }, obs).y)).toBeGreaterThanOrEqual(PLAYER_RADIUS + 50 - 1e-6);
  });

  it('follows a stair ramp between two floors', () => {
    const ground = lvl('g', 0);
    const first = lvl('f', 3000);
    ground.stairs.push({ id: 's', pos: { x: 0, y: 0 }, rotationDeg: 0, width: 800, length: 3000, toLevelId: 'f', direction: 'up' });
    const ramps = stairRamps([ground, first]);
    expect(rampHeight(ramps[0], { x: -1500, y: 0 })).toBeCloseTo(0, 6);
    expect(rampHeight(ramps[0], { x: 0, y: 0 })).toBeCloseTo(1500, 6);
    expect(rampHeight(ramps[0], { x: 0, y: 600 })).toBeNull(); // beside the stair
    expect(floorHeightAt({ x: 1400, y: 0 }, 2700, [ground, first], ramps)).toBeCloseTo(2900, 6);
  });

  it('picks the floor under your feet', () => {
    const levels = [lvl('g', 0), lvl('f', 2950), lvl('s', 5900)];
    expect(levelUnderFeet(2950, levels)!.id).toBe('f');
    expect(levelUnderFeet(2700, levels)!.id).toBe('f'); // within a step of the first floor
    expect(levelUnderFeet(1000, levels)!.id).toBe('g');
    expect(floorHeightAt({ x: 9e6, y: 0 }, 5900, levels, [])).toBe(5900);
  });
});
