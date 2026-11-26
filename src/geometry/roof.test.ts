import { describe, expect, it } from 'vitest';
import type { Level, RoomSlope } from '../model/types';
import { blankLevel } from './testUtils';
import { addWall, defaultWallProps, nodePos } from './wallGraph';
import { detectRooms, syncRooms } from './rooms';
import {
  ceilingHeightAt,
  clipAffine,
  contourSegments,
  flatRegion,
  heightAt,
  lowPolygons,
  lowestBetween,
  resolveSlopes,
  slopedRegions,
  slopeZones,
  tallPolygon,
  usableArea,
  wallTop,
  zoneHeightAt,
} from './roof';
import { signedArea } from './vec';

/** A loft 4000 x 6000 (centrelines), 100 mm walls. Back wall y = 0, front wall y = 6000. Flat ceiling 2200. */
function loft(which: ('back' | 'front')[] = ['back', 'front'], knee = 900, pitch = 35): Level {
  const L = blankLevel();
  L.ceilingHeight = 2200;
  const p = { ...defaultWallProps(), structural: 'nonLoadBearing' as const };
  addWall(L, { x: 0, y: 0 }, { x: 4000, y: 0 }, p);
  addWall(L, { x: 4000, y: 0 }, { x: 4000, y: 6000 }, p);
  addWall(L, { x: 4000, y: 6000 }, { x: 0, y: 6000 }, p);
  addWall(L, { x: 0, y: 6000 }, { x: 0, y: 0 }, p);
  syncRooms(L);
  const wallAt = (y: number) => L.walls.find((w) => nodePos(L, w.a).y === y && nodePos(L, w.b).y === y)!;
  const slopes: RoomSlope[] = which.map((s, i) => ({ id: `s${i}`, wallId: wallAt(s === 'back' ? 0 : 6000).id, kneeHeight: knee, pitchDeg: pitch }));
  L.rooms[0].slopes = slopes;
  return L;
}

const TAN35 = Math.tan((35 * Math.PI) / 180);
const zone = (L: Level) => slopeZones(L)[0];

describe('ceiling height under slopes', () => {
  it('is the knee height at the wall face and rises at the pitch', () => {
    const z = zone(loft());
    // Inside face of the back wall is y = 50.
    expect(heightAt(z.slopes, z.flat, { x: 2000, y: 50 })).toBeCloseTo(900, 3);
    expect(heightAt(z.slopes, z.flat, { x: 2000, y: 550 })).toBeCloseTo(900 + 500 * TAN35, 3);
    // Same from the front wall (inside face y = 5950).
    expect(heightAt(z.slopes, z.flat, { x: 2000, y: 5450 })).toBeCloseTo(900 + 500 * TAN35, 3);
  });

  it('is flat at the room ceiling height where the slopes meet it', () => {
    const z = zone(loft());
    expect(heightAt(z.slopes, z.flat, { x: 2000, y: 3000 })).toBe(2200);
    const reach = (2200 - 900) / TAN35; // from the face
    expect(heightAt(z.slopes, z.flat, { x: 2000, y: 50 + reach + 10 })).toBe(2200);
    expect(heightAt(z.slopes, z.flat, { x: 2000, y: 50 + reach - 100 })).toBeLessThan(2200);
  });

  it('uses the room ceiling height setting as the flat part, and one slope leaves the other side flat', () => {
    const L = loft(['back']);
    L.rooms[0].ceilingHeight = 2400;
    const z = zone(L);
    expect(z.flat).toBe(2400);
    expect(heightAt(z.slopes, z.flat, { x: 2000, y: 5900 })).toBe(2400);
    expect(heightAt(z.slopes, z.flat, { x: 2000, y: 50 })).toBeCloseTo(900, 3);
  });

  it('is read for a plan point on the level, with a flat ceiling outside sloped rooms', () => {
    const L = loft();
    expect(ceilingHeightAt(L, { x: 2000, y: 50 })).toBeCloseTo(900, 3);
    expect(ceilingHeightAt(L, { x: 2000, y: 3000 })).toBe(2200);
    const flatRoom = { ...L, rooms: [{ ...L.rooms[0], slopes: undefined }] };
    expect(ceilingHeightAt(flatRoom, { x: 2000, y: 50 })).toBe(2200);
    expect(zoneHeightAt(slopeZones(flatRoom), { x: 2000, y: 50 })).toBeUndefined();
    expect(zoneHeightAt(slopeZones(L), { x: 99999, y: 0 })).toBeUndefined();
  });

  it('skips a slope whose wall is gone', () => {
    const L = loft();
    L.rooms[0].slopes![0].wallId = 'nope';
    expect(resolveSlopes(L, L.rooms[0], detectRooms(L)[0])).toHaveLength(1);
  });
});

describe('usable floor area (ceiling 1.5 m or more)', () => {
  it('draws the 1.5 m line where the slope reaches 1500 mm, on each side', () => {
    const z = zone(loft());
    const segs = contourSegments(z.poly, z.flat, z.slopes);
    expect(segs).toHaveLength(2);
    const d = 600 / TAN35; // 1500 - 900 above the knee
    const ys = segs
      .map(([p, q]) => {
        expect(p.y).toBeCloseTo(q.y, 3);
        return p.y;
      })
      .sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(50 + d, 2);
    expect(ys[1]).toBeCloseTo(5950 - d, 2);
    for (const [p, q] of segs) expect(Math.abs(q.x - p.x)).toBeCloseTo(3900, 2);
  });

  it('measures the usable area and the hatched low area', () => {
    const z = zone(loft());
    const d = 600 / TAN35;
    const a = usableArea(z.poly, z.flat, z.slopes);
    expect(a.total).toBeCloseTo(5900 * 3900, -2);
    expect(a.usable).toBeCloseTo((5900 - 2 * d) * 3900, -2);
    const low = lowPolygons(z.poly, z.flat, z.slopes);
    expect(low).toHaveLength(2);
    for (const p of low) expect(Math.abs(signedArea(p))).toBeCloseTo(d * 3900, -2);
    expect(Math.abs(signedArea(tallPolygon(z.poly, z.flat, z.slopes)))).toBeCloseTo(a.usable, 0);
  });

  it('has no 1.5 m line when the knee wall is already 1.5 m or more, or the flat ceiling is lower', () => {
    const tall = zone(loft(['back', 'front'], 1600));
    expect(contourSegments(tall.poly, 2200, tall.slopes)).toEqual([]);
    expect(usableArea(tall.poly, 2200, tall.slopes).usable).toBeCloseTo(5900 * 3900, -2);
    const z = zone(loft());
    expect(contourSegments(z.poly, 1400, z.slopes)).toEqual([]);
    expect(lowPolygons(z.poly, 1400, z.slopes)).toHaveLength(1); // the whole floor is low
  });

  it('counts nothing as usable when the slope never gets to 1.5 m inside the room', () => {
    const z = zone(loft(['back'], 300, 10));
    // 1200 / tan(10 deg) = 6.8 m: past the far wall.
    expect(usableArea(z.poly, z.flat, z.slopes).usable).toBe(0);
  });
});

describe('ceiling surfaces and walls under a slope', () => {
  it('splits the ceiling into a flat part and one tilted plane per slope that tile the room', () => {
    const z = zone(loft());
    const flat = flatRegion(z.poly, z.flat, z.slopes);
    const sloped = slopedRegions(z.poly, z.flat, z.slopes);
    expect(sloped).toHaveLength(2);
    const total = Math.abs(signedArea(flat)) + sloped.reduce((t, s) => t + Math.abs(signedArea(s.poly)), 0);
    expect(total).toBeCloseTo(5900 * 3900, -2);
    for (const s of sloped) for (const p of s.poly) expect(s.slope.plane.k + s.slope.plane.gx * p.x + s.slope.plane.gy * p.y).toBeLessThanOrEqual(2200.001);
  });

  it('cuts a side wall to the slope line with exact breakpoints', () => {
    const z = zone(loft());
    // The left wall runs along y from the back (u = 0) to the front; read 50 mm inside the room.
    const top = wallTop(z.slopes, z.flat, { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 50, y: 0 }, -50, 6050, 2700);
    const reach = (2200 - 900) / TAN35;
    expect(top.map((t) => Math.round(t.u))).toEqual([-50, Math.round(50 + reach), Math.round(5950 - reach), 6050]);
    expect(top[1].v).toBeCloseTo(2200, 2);
    expect(top[2].v).toBeCloseTo(2200, 2);
    expect(top[0].v).toBeCloseTo(900 - 100 * TAN35, 2); // 50 mm past the face, still on the plane
    expect(lowestBetween(top, 0, 6000)).toBeLessThan(900);
    expect(lowestBetween(top, 2000, 3000)).toBe(2200);
  });

  it('keeps a knee wall at the knee height along its length', () => {
    const z = zone(loft());
    const top = wallTop(z.slopes, z.flat, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 50 }, 0, 4000, 2700);
    for (const t of top) expect(t.v).toBeCloseTo(900, 3);
  });

  it('clips a polygon by a plane', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const half = clipAffine(sq, { k: -5, gx: 1, gy: 0 }); // x >= 5
    expect(Math.abs(signedArea(half))).toBeCloseTo(50, 6);
    expect(clipAffine(sq, { k: -50, gx: 1, gy: 0 })).toEqual([]);
  });
});
