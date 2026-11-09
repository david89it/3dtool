// Snapping for drawing and dragging: existing corners, wall midpoints,
// 0/45/90 degree angles from the previous point, and points on walls.
// Holding Alt passes `disabled` and returns the raw point.

import type { Id, Level, Vec2 } from '../model/types';
import { add, dist, dot, lerp, mul, segmentIntersect, sub } from './vec';
import { findWallNear, wallEnds } from './wallGraph';

export type SnapKind = 'node' | 'midpoint' | 'wall' | 'angle' | 'grid' | 'none';

export interface SnapResult {
  point: Vec2;
  kind: SnapKind;
  nodeId?: Id;
  wallId?: Id;
}

export interface SnapOptions {
  from?: Vec2;
  tol: number; // mm, already converted from screen pixels
  disabled?: boolean;
  excludeNode?: Id;
  angleTolDeg?: number;
  round?: number; // mm
}

const round = (x: number, step: number) => Math.round(x / step) * step;

export function snapPoint(level: Level, raw: Vec2, opts: SnapOptions): SnapResult {
  if (opts.disabled) return { point: raw, kind: 'none' };
  const tol = opts.tol;
  const step = opts.round ?? 10;

  let bestNode: { id: Id; d: number; pos: Vec2 } | undefined;
  for (const n of level.nodes) {
    if (n.id === opts.excludeNode) continue;
    const d = dist(n.pos, raw);
    if (d <= tol && (!bestNode || d < bestNode.d)) bestNode = { id: n.id, d, pos: n.pos };
  }
  if (bestNode) return { point: bestNode.pos, kind: 'node', nodeId: bestNode.id };

  for (const w of level.walls) {
    if (opts.excludeNode && (w.a === opts.excludeNode || w.b === opts.excludeNode)) continue;
    const [a, b] = wallEnds(level, w);
    const m = lerp(a, b, 0.5);
    if (dist(m, raw) <= tol * 0.8) return { point: m, kind: 'midpoint', wallId: w.id };
  }

  if (opts.from) {
    const from = opts.from;
    const dv = sub(raw, from);
    const l = Math.hypot(dv.x, dv.y);
    if (l > 1) {
      const ang = Math.atan2(dv.y, dv.x);
      const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
      const diff = Math.abs(((ang - snapped + Math.PI) % (2 * Math.PI)) - Math.PI);
      if (diff <= ((opts.angleTolDeg ?? 8) * Math.PI) / 180) {
        const dir = { x: Math.cos(snapped), y: Math.sin(snapped) };
        const along = dot(dv, dir);
        const p = add(from, mul(dir, round(along, step)));
        // Stop exactly on a wall the ray reaches (T-junction).
        const far = add(from, mul(dir, along + tol * 2));
        for (const w of level.walls) {
          if (opts.excludeNode && (w.a === opts.excludeNode || w.b === opts.excludeNode)) continue;
          const [a, b] = wallEnds(level, w);
          const hit = segmentIntersect(from, far, a, b);
          if (hit && dist(hit.point, raw) <= tol && hit.t > 0.01) {
            return { point: hit.point, kind: 'wall', wallId: w.id };
          }
        }
        return { point: p, kind: 'angle' };
      }
    }
  }

  const onWall = findWallNear(level, raw, tol, opts.excludeNode);
  if (onWall) return { point: onWall.point, kind: 'wall', wallId: onWall.wall.id };

  if (opts.from) {
    const dv = sub(raw, opts.from);
    const l = Math.hypot(dv.x, dv.y);
    if (l > 1) return { point: add(opts.from, mul(dv, round(l, step) / l)), kind: 'grid' };
  }
  return { point: { x: round(raw.x, step), y: round(raw.y, step) }, kind: 'grid' };
}
