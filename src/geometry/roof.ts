// Sloped ceilings (a loft under a pitched roof). Pure maths in plan millimetres.
//
// A slope is a plane: it is `kneeHeight` tall at the inside face of its wall and
// rises at `pitchDeg` into the room, until it meets the flat ceiling. With one or
// two slopes the ceiling height at a point is the lowest of the flat ceiling and
// each slope's plane. Every plane is affine in plan (x, y), so clipping a room
// outline by "height above some level" is a half-plane cut.
//
// UK "usable floor area" convention: floor under a ceiling lower than 1.5 m does
// not count, so the 2D plan draws a dashed line where the ceiling is 1.5 m high.

import type { Level, Room, RoomSlope, Vec2 } from '../model/types';
import { detectRooms, matchDetected, type DetectedRoom } from './rooms';
import { dot, perpL, perpR, pointInPolygon, signedArea, sub } from './vec';

/** Ceiling height below which floor is not "usable floor area" (mm). */
export const USABLE_HEIGHT = 1500;
export const DEFAULT_KNEE = 900;
export const DEFAULT_PITCH = 35;
export const MAX_SLOPES = 2;
export const MIN_PITCH = 5;
export const MAX_PITCH = 80;

/** height = k + gx * x + gy * y (mm). */
export interface Plane {
  k: number;
  gx: number;
  gy: number;
}

export interface ResolvedSlope {
  slope: RoomSlope;
  plane: Plane;
  /** Unit vector from the wall into the room. */
  inward: Vec2;
  /** Where the wall's inside face is (a point on it). */
  face: Vec2;
}

export const planeAt = (pl: Plane, p: Vec2): number => pl.k + pl.gx * p.x + pl.gy * p.y;

/** Lowest height allowed by any slope here, or Infinity. */
function slopeMin(slopes: ResolvedSlope[], p: Vec2): number {
  let h = Infinity;
  for (const s of slopes) h = Math.min(h, planeAt(s.plane, p));
  return h;
}

/** Ceiling height at a point of a room with these slopes and this flat ceiling (mm). */
export function heightAt(slopes: ResolvedSlope[], flat: number, p: Vec2): number {
  return Math.min(flat, slopeMin(slopes, p));
}

/** The room's flat ceiling height (mm). */
export const flatCeiling = (level: Pick<Level, 'ceilingHeight'>, room: Pick<Room, 'ceilingHeight'> | undefined): number => room?.ceilingHeight ?? level.ceilingHeight;

/**
 * Turn a room's stored slopes into planes. A slope whose wall is gone is
 * skipped. The room side comes from the wall's edge in the room loop, or
 * (when the wall was split) from which side of the wall the room's middle is.
 */
export function resolveSlopes(level: Level, room: Room | undefined, detected: DetectedRoom | undefined): ResolvedSlope[] {
  const out: ResolvedSlope[] = [];
  if (!room?.slopes?.length || !detected) return out;
  const pos = new Map(level.nodes.map((n) => [n.id, n.pos] as const));
  for (const slope of room.slopes) {
    const wall = level.walls.find((w) => w.id === slope.wallId);
    const a = wall ? pos.get(wall.a) : undefined;
    const b = wall ? pos.get(wall.b) : undefined;
    if (!wall || !a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) continue;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const edge = detected.edges.find((e) => e.wallId === wall.id);
    let inward: Vec2;
    if (edge) inward = edge.from === wall.a ? perpL(dir) : perpR(dir);
    else inward = dot(sub(detected.label, a), perpL(dir)) >= 0 ? perpL(dir) : perpR(dir);
    const face = { x: a.x + inward.x * (wall.thickness / 2), y: a.y + inward.y * (wall.thickness / 2) };
    const tan = Math.tan((Math.min(MAX_PITCH, Math.max(MIN_PITCH, slope.pitchDeg)) * Math.PI) / 180);
    const plane: Plane = {
      k: slope.kneeHeight - tan * dot(face, inward),
      gx: tan * inward.x,
      gy: tan * inward.y,
    };
    out.push({ slope, plane, inward, face });
  }
  return out;
}

/** Everything the maths needs about one sloped room. */
export interface SlopeZone {
  roomId: string;
  poly: Vec2[];
  flat: number;
  slopes: ResolvedSlope[];
}

/** The sloped rooms of a level (rooms without slopes are left out). */
export function slopeZones(level: Level, detected: DetectedRoom[] = detectRooms(level)): SlopeZone[] {
  const out: SlopeZone[] = [];
  for (const room of level.rooms) {
    if (!room.slopes?.length) continue;
    const d = matchDetected(room, detected);
    if (!d) continue;
    const slopes = resolveSlopes(level, room, d);
    if (slopes.length) out.push({ roomId: room.id, poly: d.inner, flat: flatCeiling(level, room), slopes });
  }
  return out;
}

/** Ceiling height at a point if it is inside a sloped room, else undefined. */
export function zoneHeightAt(zones: SlopeZone[], p: Vec2): number | undefined {
  for (const z of zones) if (pointInPolygon(p, z.poly)) return heightAt(z.slopes, z.flat, p);
  return undefined;
}

/** Ceiling height at a plan point on a level: the room's slope if it has one, else its flat ceiling. */
export function ceilingHeightAt(level: Level, p: Vec2, detected: DetectedRoom[] = detectRooms(level)): number {
  const zone = slopeZones(level, detected).find((z) => pointInPolygon(p, z.poly));
  if (zone) return heightAt(zone.slopes, zone.flat, p);
  const d = detected.find((r) => !r.solid && pointInPolygon(p, r.inner));
  const room = d ? level.rooms.find((r) => r.boundary.join('|') === d.nodeIds.join('|')) : undefined;
  return flatCeiling(level, room);
}

// ---- polygon cutting ---------------------------------------------------------

/** Keep the part of a polygon where f(p) >= 0, for f affine (Sutherland-Hodgman). */
export function clipAffine(poly: Vec2[], f: Plane): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const fp = planeAt(f, p);
    const fq = planeAt(f, q);
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) {
      const t = fp / (fp - fq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return out.length >= 3 ? out : [];
}

const diff = (a: Plane, b: Plane): Plane => ({ k: a.k - b.k, gx: a.gx - b.gx, gy: a.gy - b.gy });
const minus = (a: Plane, c: number): Plane => ({ k: a.k - c, gx: a.gx, gy: a.gy });
const neg = (a: Plane): Plane => ({ k: -a.k, gx: -a.gx, gy: -a.gy });
const areaOf = (poly: Vec2[]): number => (poly.length >= 3 ? Math.abs(signedArea(poly)) : 0);

/** Part of the room with the flat ceiling. */
export function flatRegion(poly: Vec2[], flat: number, slopes: ResolvedSlope[]): Vec2[] {
  let r = poly;
  for (const s of slopes) r = clipAffine(r, minus(s.plane, flat));
  return r;
}

/** Parts of the room where each slope (and not the flat ceiling or another slope) is the ceiling. */
export function slopedRegions(poly: Vec2[], flat: number, slopes: ResolvedSlope[]): { slope: ResolvedSlope; poly: Vec2[] }[] {
  const out: { slope: ResolvedSlope; poly: Vec2[] }[] = [];
  slopes.forEach((s, i) => {
    let r = clipAffine(poly, neg(minus(s.plane, flat))); // slope lower than the flat ceiling
    slopes.forEach((o, j) => {
      if (j !== i && r.length) r = clipAffine(r, diff(o.plane, s.plane)); // other slope is not lower
    });
    if (r.length) out.push({ slope: s, poly: r });
  });
  return out;
}

/** Floor where the ceiling is at least `target` high. */
export function tallPolygon(poly: Vec2[], flat: number, slopes: ResolvedSlope[], target = USABLE_HEIGHT): Vec2[] {
  if (flat < target) return [];
  let r = poly;
  for (const s of slopes) r = clipAffine(r, minus(s.plane, target));
  return r;
}

/** Floor where the ceiling is lower than `target`: one piece per slope (they can overlap). */
export function lowPolygons(poly: Vec2[], flat: number, slopes: ResolvedSlope[], target = USABLE_HEIGHT): Vec2[][] {
  if (flat < target) return [poly];
  const out: Vec2[][] = [];
  for (const s of slopes) {
    const r = clipAffine(poly, neg(minus(s.plane, target)));
    if (r.length) out.push(r);
  }
  return out;
}

export interface UsableArea {
  /** mm² of floor with a ceiling at least 1.5 m high. */
  usable: number;
  /** mm² of the whole floor. */
  total: number;
}

/** Usable floor area: floor under a ceiling of 1.5 m or more. */
export function usableArea(poly: Vec2[], flat: number, slopes: ResolvedSlope[], target = USABLE_HEIGHT): UsableArea {
  return { usable: areaOf(tallPolygon(poly, flat, slopes, target)), total: areaOf(poly) };
}

/**
 * The line (segments, plan mm) where the ceiling is exactly `target` high:
 * the edge of the usable floor. Only where that slope is the lowest part of
 * the ceiling, and only when the flat ceiling is higher than `target`.
 */
export function contourSegments(poly: Vec2[], flat: number, slopes: ResolvedSlope[], target = USABLE_HEIGHT): [Vec2, Vec2][] {
  const out: [Vec2, Vec2][] = [];
  if (flat <= target) return out;
  for (const s of slopes) {
    const dir = { x: -s.inward.y, y: s.inward.x };
    // Points where the line height == target meets the room outline.
    const f = minus(s.plane, target);
    const ts: number[] = [];
    // O: where the line crosses the inward axis from the wall face (f changes by tan per mm).
    const rate = f.gx * s.inward.x + f.gy * s.inward.y;
    if (Math.abs(rate) < 1e-9) continue;
    const O = { x: s.face.x - s.inward.x * (planeAt(f, s.face) / rate), y: s.face.y - s.inward.y * (planeAt(f, s.face) / rate) };
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const fp = planeAt(f, p);
      const fq = planeAt(f, q);
      if (fp === fq || fp > 0 === fq > 0) continue;
      const t = fp / (fp - fq);
      const X = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
      ts.push(dot(sub(X, O), dir));
    }
    ts.sort((a, b) => a - b);
    for (let i = 0; i + 1 < ts.length; i++) {
      const mid = ts[i] + (ts[i + 1] - ts[i]) / 2;
      const M = { x: O.x + dir.x * mid, y: O.y + dir.y * mid };
      if (!pointInPolygon(M, poly)) continue;
      let u0 = ts[i];
      let u1 = ts[i + 1];
      // Keep only where no other slope is lower.
      for (const o of slopes) {
        if (o === s) continue;
        const g = diff(o.plane, s.plane); // >= 0 keeps
        const g0 = planeAt(g, { x: O.x + dir.x * u0, y: O.y + dir.y * u0 });
        const g1 = planeAt(g, { x: O.x + dir.x * u1, y: O.y + dir.y * u1 });
        if (g0 < 0 && g1 < 0) {
          u1 = u0;
          break;
        }
        if (g0 < 0 !== g1 < 0) {
          const t = g0 / (g0 - g1);
          const um = u0 + (u1 - u0) * t;
          if (g0 < 0) u0 = um;
          else u1 = um;
        }
      }
      if (u1 - u0 > 1) out.push([{ x: O.x + dir.x * u0, y: O.y + dir.y * u0 }, { x: O.x + dir.x * u1, y: O.y + dir.y * u1 }]);
    }
  }
  return out;
}

// ---- walls under a slope -----------------------------------------------------

/**
 * Top edge of a wall under a sloped ceiling, as a polyline in the wall's own frame
 * (u mm along the wall from node a, v mm up). The height is read a little inside the
 * room (`side` is the wall normal pointing into it), so a knee wall is cut at its
 * knee height. Breakpoints are exact: the top is the lowest of straight lines.
 */
export function wallTop(
  slopes: ResolvedSlope[],
  flat: number,
  a: Vec2,
  d: Vec2,
  shift: Vec2,
  u0: number,
  u1: number,
  cap: number,
): { u: number; v: number }[] {
  // Each line: v = c + m * u.
  const lines: { c: number; m: number }[] = [{ c: Math.min(flat, cap), m: 0 }];
  const origin = { x: a.x + shift.x, y: a.y + shift.y };
  for (const s of slopes) lines.push({ c: planeAt(s.plane, origin), m: s.plane.gx * d.x + s.plane.gy * d.y });
  const us = new Set<number>([u0, u1]);
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const dm = lines[i].m - lines[j].m;
      if (Math.abs(dm) < 1e-12) continue;
      const u = (lines[j].c - lines[i].c) / dm;
      if (u > u0 + 0.5 && u < u1 - 0.5) us.add(u);
    }
  }
  const pts = [...us]
    .sort((p, q) => p - q)
    .map((u) => ({ u, v: Math.max(50, Math.min(cap, ...lines.map((l) => l.c + l.m * u))) }));
  // Drop points that sit on the straight line between their neighbours (crossings hidden above the flat ceiling).
  return pts.filter((p, i) => {
    if (i === 0 || i === pts.length - 1) return true;
    const a = pts[i - 1];
    const b = pts[i + 1];
    const on = a.v + ((b.v - a.v) * (p.u - a.u)) / (b.u - a.u || 1);
    return Math.abs(on - p.v) > 0.5;
  });
}

/** Lowest height of a wall top polyline between two u values. */
export function lowestBetween(top: { u: number; v: number }[], u0: number, u1: number): number {
  const at = (u: number) => {
    for (let i = 0; i + 1 < top.length; i++) {
      if (u >= top[i].u && u <= top[i + 1].u) {
        const t = (u - top[i].u) / (top[i + 1].u - top[i].u || 1);
        return top[i].v + (top[i + 1].v - top[i].v) * t;
      }
    }
    return top[top.length - 1].v;
  };
  let best = Math.min(at(u0), at(u1));
  for (const p of top) if (p.u > u0 && p.u < u1) best = Math.min(best, p.v);
  return best;
}

/** The walls around a room with the direction into the room and their length, for choosing where a slope comes down. */
export function boundaryWalls(level: Level, detected: DetectedRoom): { wallId: string; inward: Vec2; length: number }[] {
  const out: { wallId: string; inward: Vec2; length: number }[] = [];
  for (const e of detected.edges) {
    if (out.some((o) => o.wallId === e.wallId)) continue;
    const w = level.walls.find((x) => x.id === e.wallId);
    const a = w && level.nodes.find((n) => n.id === w.a)?.pos;
    const b = w && level.nodes.find((n) => n.id === w.b)?.pos;
    if (!w || !a || !b) continue;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1) continue;
    const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    out.push({ wallId: w.id, inward: e.from === w.a ? perpL(dir) : perpR(dir), length });
  }
  return out;
}

/** Plain words for which side of the room a wall is on, for panels ("front wall"). Plan y points to the front of the house. */
export function wallSideWord(inward: Vec2): string {
  if (Math.abs(inward.y) >= Math.abs(inward.x)) return inward.y < 0 ? 'front wall' : 'back wall';
  return inward.x > 0 ? 'left wall' : 'right wall';
}
