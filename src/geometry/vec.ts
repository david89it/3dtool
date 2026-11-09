import type { Vec2 } from '../model/types';

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const norm = (a: Vec2): Vec2 => {
  const l = len(a);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
/** Rotate +90° in maths convention: (x, y) -> (-y, x). */
export const perpL = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });
/** Rotate -90° in maths convention: (x, y) -> (y, -x). */
export const perpR = (a: Vec2): Vec2 => ({ x: a.y, y: -a.x });
export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);
export const eq = (a: Vec2, b: Vec2, tol = 1e-6): boolean => dist(a, b) <= tol;

export function rotate(p: Vec2, deg: number, about: Vec2 = { x: 0, y: 0 }): Vec2 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = p.x - about.x;
  const dy = p.y - about.y;
  return { x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c };
}

/** Closest point on segment ab to p. t is the parameter along ab, clamped to [0, 1]. */
export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2): { t: number; point: Vec2; dist: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  let t = l2 === 0 ? 0 : dot(sub(p, a), ab) / l2;
  t = Math.max(0, Math.min(1, t));
  const point = lerp(a, b, t);
  return { t, point, dist: dist(p, point) };
}

/** Intersection of two infinite lines p + s·d and q + u·e. Null if parallel. */
export function lineIntersect(p: Vec2, d: Vec2, q: Vec2, e: Vec2): Vec2 | null {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-9) return null;
  const s = cross(sub(q, p), e) / den;
  return add(p, mul(d, s));
}

/** Proper intersection of segments ab and cd; t on ab, u on cd. */
export function segmentIntersect(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  d: Vec2,
): { t: number; u: number; point: Vec2 } | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(c, a), s) / den;
  const u = cross(sub(c, a), r) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, point: add(a, mul(r, t)) };
}

/** Shoelace area; positive for counter-clockwise in maths convention. */
export function signedArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

export function centroid(poly: Vec2[]): Vec2 {
  const a = signedArea(poly);
  if (Math.abs(a) < 1e-9) {
    const sx = poly.reduce((acc, p) => acc + p.x, 0);
    const sy = poly.reduce((acc, p) => acc + p.y, 0);
    return { x: sx / poly.length, y: sy / poly.length };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function distanceToPolygonEdges(p: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const d = projectOnSegment(p, poly[i], poly[(i + 1) % poly.length]).dist;
    if (d < best) best = d;
  }
  return best;
}

/**
 * A good point to put a label: the centroid if it sits comfortably inside,
 * otherwise the sampled point furthest from every edge (handles L-shapes).
 */
export function labelPoint(poly: Vec2[]): Vec2 {
  const c = centroid(poly);
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.min(maxX - minX, maxY - minY);
  if (pointInPolygon(c, poly) && distanceToPolygonEdges(c, poly) > span * 0.3) return c;
  let best = c;
  let bestD = pointInPolygon(c, poly) ? distanceToPolygonEdges(c, poly) : -1;
  const n = 24;
  for (let i = 1; i < n; i++) {
    for (let j = 1; j < n; j++) {
      const p = { x: minX + ((maxX - minX) * i) / n, y: minY + ((maxY - minY) * j) / n };
      if (!pointInPolygon(p, poly)) continue;
      const d = distanceToPolygonEdges(p, poly);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}
