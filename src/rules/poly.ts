// Small convex-polygon helpers for the rules engine.

import type { Vec2 } from '../model/types';
import { dot, projectOnSegment, segmentIntersect, sub } from '../geometry/vec';

function axes(poly: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const e = sub(b, a);
    const l = Math.hypot(e.x, e.y);
    if (l > 1e-9) out.push({ x: -e.y / l, y: e.x / l });
  }
  return out;
}

function project(poly: Vec2[], axis: Vec2): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of poly) {
    const v = dot(p, axis);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

/**
 * Do two convex polygons overlap by more than `tol` mm? Touching (sharing
 * an edge, e.g. a wardrobe against a wall) does not count.
 */
export function convexOverlap(a: Vec2[], b: Vec2[], tol = 2): boolean {
  for (const ax of [...axes(a), ...axes(b)]) {
    const [a0, a1] = project(a, ax);
    const [b0, b1] = project(b, ax);
    if (Math.min(a1, b1) - Math.max(a0, b0) <= tol) return false;
  }
  return true;
}

/** Shortest distance between two convex polygons (0 if they overlap). */
export function polyDistance(a: Vec2[], b: Vec2[]): number {
  if (convexOverlap(a, b, 0)) return 0;
  let best = Infinity;
  const edges = (p: Vec2[]) => p.map((v, i) => [v, p[(i + 1) % p.length]] as const);
  for (const [p, q] of edges(a)) {
    for (const [r, s] of edges(b)) {
      if (segmentIntersect(p, q, r, s)) return 0;
    }
  }
  for (const v of a) for (const [r, s] of edges(b)) best = Math.min(best, projectOnSegment(v, r, s).dist);
  for (const v of b) for (const [p, q] of edges(a)) best = Math.min(best, projectOnSegment(v, p, q).dist);
  return best;
}

/** Distance from a point to a convex polygon (0 inside), for either winding. */
export function pointPolyDistance(p: Vec2, poly: Vec2[]): number {
  let pos = 0;
  let neg = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (c > 0) pos++;
    else if (c < 0) neg++;
  }
  if (pos === 0 || neg === 0) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, projectOnSegment(p, poly[i], poly[(i + 1) % poly.length]).dist);
  return best;
}

/** A rectangle given by a base edge (p -> q) and a depth along `normal`. */
export function strip(p: Vec2, q: Vec2, normal: Vec2, from: number, to: number): Vec2[] {
  return [
    { x: p.x + normal.x * from, y: p.y + normal.y * from },
    { x: q.x + normal.x * from, y: q.y + normal.y * from },
    { x: q.x + normal.x * to, y: q.y + normal.y * to },
    { x: p.x + normal.x * to, y: p.y + normal.y * to },
  ];
}
