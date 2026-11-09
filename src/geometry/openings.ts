// Doors, windows and cased openings: where they can go on a wall.
//
// Positions are `offset` (mm from node a along the centreline to the near
// edge) and `width`. An opening must sit between the inside faces of the
// walls at each end, must not overlap another opening and, in a wall that
// might be structural, must leave a pier (nib) of at least MIN_NIB at each
// side unless she overrides it.

import type { Id, Level, Opening, OpeningType, Vec2, Wall } from '../model/types';
import type { JointData } from './joints';
import { uid } from '../model/ids';
import { dot, projectOnSegment, sub } from './vec';

export const MIN_NIB = 100;

/** Shown on every wall with a new opening that may be structural (brief, phase 2). */
export const STRUCTURAL_BADGE_TEXT =
  "Structural opening: needs engineer, steel and Building Control. Leasehold: needs landlord's licence.";

export const OPENING_DEFAULTS: Record<OpeningType, { width: number; height: number; sill: number }> = {
  door: { width: 800, height: 2000, sill: 0 },
  window: { width: 1000, height: 1200, sill: 900 },
  bayWindow: { width: 1000, height: 1600, sill: 700 },
  opening: { width: 1200, height: 2100, sill: 0 },
};

export const OPENING_LABEL: Record<OpeningType, string> = {
  door: 'Door',
  window: 'Window',
  bayWindow: 'Bay window',
  opening: 'Opening',
};

/** Anything not confirmed as non-load-bearing is treated as structural. */
export function isStructural(w: Wall): boolean {
  return w.structural !== 'nonLoadBearing';
}

/** New or changed openings in a structural wall need the warning badge. */
export function needsStructuralBadge(w: Wall): boolean {
  return isStructural(w) && w.openings.some((o) => !o.existing);
}

export interface Range {
  start: number;
  end: number;
}

/** The stretch of a wall between the inside faces of the walls at its ends. */
export function usableRange(J: JointData, wallId: Id): Range | null {
  const o = J.outlines.get(wallId);
  if (!o) return null;
  const d = o.dir;
  const start = Math.max(0, dot(sub(o.aL, o.a), d), dot(sub(o.aR, o.a), d));
  const end = Math.min(o.length, dot(sub(o.bL, o.a), d), dot(sub(o.bR, o.a), d));
  return { start, end: Math.max(start, end) };
}

function nibFor(w: Wall, o?: Opening): number {
  return isStructural(w) && !o?.nibOverride ? MIN_NIB : 0;
}

/**
 * Intervals of valid `offset` values for an opening of `width` on this wall,
 * leaving out the opening being moved (`excludeId`).
 */
export function allowedOffsets(
  w: Wall,
  range: Range,
  width: number,
  opts: { excludeId?: Id; nib?: number } = {},
): [number, number][] {
  const nib = opts.nib ?? nibFor(w);
  let intervals: [number, number][] = [[range.start + nib, range.end - nib - width]];
  for (const o of w.openings) {
    if (o.id === opts.excludeId) continue;
    const blockFrom = o.offset - nib - width;
    const blockTo = o.offset + o.width + nib;
    const next: [number, number][] = [];
    for (const [a, b] of intervals) {
      if (blockTo <= a || blockFrom >= b) {
        next.push([a, b]);
        continue;
      }
      if (blockFrom > a) next.push([a, blockFrom]);
      if (blockTo < b) next.push([blockTo, b]);
    }
    intervals = next;
  }
  return intervals.filter(([a, b]) => b >= a - 1e-6);
}

/** Nearest allowed offset to `desired`, or null if the opening does not fit anywhere. */
export function snapOffset(intervals: [number, number][], desired: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const [a, b] of intervals) {
    const x = Math.min(Math.max(desired, a), b);
    const d = Math.abs(x - desired);
    if (d < bestD) {
      bestD = d;
      best = x;
    }
  }
  return best === null ? null : Math.round(best);
}

/** Where an opening centred at `centre` (mm along the wall) can go, or null. */
export function fitOpening(
  w: Wall,
  range: Range,
  centre: number,
  width: number,
  opts: { excludeId?: Id; nib?: number } = {},
): number | null {
  return snapOffset(allowedOffsets(w, range, width, opts), centre - width / 2);
}

/** Largest gap available for a new opening (for "open up this wall"). */
export function largestGap(w: Wall, range: Range): { offset: number; width: number } | null {
  const nib = nibFor(w);
  const edges: [number, number][] = [];
  let cursor = range.start + nib;
  const sorted = [...w.openings].sort((a, b) => a.offset - b.offset);
  for (const o of sorted) {
    edges.push([cursor, o.offset - nib]);
    cursor = Math.max(cursor, o.offset + o.width + nib);
  }
  edges.push([cursor, range.end - nib]);
  let best: { offset: number; width: number } | null = null;
  for (const [a, b] of edges) {
    if (b - a > 100 && (!best || b - a > best.width)) best = { offset: Math.round(a), width: Math.floor(b - a) };
  }
  return best;
}

export interface EndDistances {
  before: number; // from the inside face at the a end to the opening
  after: number; // from the opening to the inside face at the b end
}

export function endDistances(range: Range, o: Opening): EndDistances {
  return { before: o.offset - range.start, after: range.end - (o.offset + o.width) };
}

/** Piers narrower than MIN_NIB in a structural wall (ignoring her override). */
export function nibShortfall(w: Wall, range: Range, o: Opening): boolean {
  if (!isStructural(w)) return false;
  const { before, after } = endDistances(range, o);
  if (before < MIN_NIB - 0.5 || after < MIN_NIB - 0.5) return true;
  return w.openings.some(
    (x) =>
      x.id !== o.id &&
      ((x.offset >= o.offset && x.offset - (o.offset + o.width) < MIN_NIB - 0.5) ||
        (x.offset < o.offset && o.offset - (x.offset + x.width) < MIN_NIB - 0.5)),
  );
}

/** Wall closest to a point, with the position along it. */
export function nearestWall(
  level: Level,
  J: JointData,
  p: Vec2,
  tol: number,
): { wall: Wall; along: number; dist: number } | undefined {
  let best: { wall: Wall; along: number; dist: number } | undefined;
  for (const w of level.walls) {
    const o = J.outlines.get(w.id);
    if (!o) continue;
    const pr = projectOnSegment(p, o.a, o.b);
    const d = Math.max(0, pr.dist - w.thickness / 2);
    if (d <= tol && (!best || d < best.dist)) best = { wall: w, along: pr.t * o.length, dist: d };
  }
  return best;
}

/** Opening under a point, if any. */
export function hitOpening(level: Level, J: JointData, p: Vec2, tol: number): { wall: Wall; opening: Opening } | undefined {
  for (const w of level.walls) {
    const o = J.outlines.get(w.id);
    if (!o || w.openings.length === 0) continue;
    const pr = projectOnSegment(p, o.a, o.b);
    if (pr.dist > w.thickness / 2 + tol) continue;
    const s = pr.t * o.length;
    for (const op of w.openings) {
      if (s >= op.offset - tol && s <= op.offset + op.width + tol) return { wall: w, opening: op };
    }
  }
  return undefined;
}

export function makeOpening(type: OpeningType, offset: number, width?: number): Opening {
  const d = OPENING_DEFAULTS[type];
  const o: Opening = {
    id: uid('o'),
    type,
    offset,
    width: width ?? d.width,
    height: d.height,
    sill: d.sill,
  };
  if (type === 'door') o.swing = { hinge: 'start', side: 'left', angle: 90 };
  return o;
}

export function findOpening(level: Level, openingId: Id): { wall: Wall; opening: Opening } | undefined {
  for (const w of level.walls) {
    const o = w.openings.find((x) => x.id === openingId);
    if (o) return { wall: w, opening: o };
  }
  return undefined;
}
