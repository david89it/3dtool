// Pure geometry for 3D walls: the side profile of a wall with rectangular
// holes for its openings. No three.js here so it can be unit-tested.
//
// Profile coordinates (millimetres): u runs along the wall from node a
// (openings' `offset` is measured the same way), v runs up from the floor.

import type { Id, Level, Opening, Wall } from '../model/types';
import { angleOf, dist, norm, sub } from '../geometry/vec';

export interface Rect {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export interface WallProfile {
  outer: Rect;
  holes: (Rect & { openingId: Id })[];
}

/** Gap kept between a hole and the profile edge so the shape stays valid. */
const EDGE = 20;

/**
 * Side profile of a wall: from -extA to length + extB along the wall, full
 * height, with a hole per opening (clipped so it never touches the outline).
 */
export function wallProfile(length: number, height: number, openings: Opening[], extA = 0, extB = 0): WallProfile {
  const outer = { u0: 0 - extA, u1: length + extB, v0: 0, v1: height };
  const holes: WallProfile['holes'] = [];
  for (const o of openings) {
    const u0 = Math.max(o.offset, EDGE - extA);
    const u1 = Math.min(o.offset + o.width, length + extB - EDGE);
    // Doors and cased openings sit on the floor: keep a hair of wall below so
    // the hole stays inside the outline (it is hidden under the floor).
    const v0 = Math.max(o.sill, 1);
    const v1 = Math.min(o.sill + o.height, height - EDGE);
    if (u1 - u0 > 1 && v1 - v0 > 1) holes.push({ u0, u1, v0, v1, openingId: o.id });
  }
  return { outer, holes };
}

/**
 * How far to extend each end of a wall so corners close: half the thickness
 * of the thickest wall meeting it at an angle (collinear continuations don't
 * count, so a wall running straight through a T-junction is not extended).
 */
export function wallEndExtensions(level: Level, wall: Wall): { extA: number; extB: number } {
  const pos = new Map(level.nodes.map((n) => [n.id, n.pos] as const));
  const a = pos.get(wall.a);
  const b = pos.get(wall.b);
  if (!a || !b) return { extA: 0, extB: 0 };
  const ext = (nodeId: Id, from: typeof a, to: typeof a) => {
    const dirOut = angleOf(sub(to, from));
    let best = 0;
    for (const w of level.walls) {
      if (w.id === wall.id || (w.a !== nodeId && w.b !== nodeId)) continue;
      const p = pos.get(w.a === nodeId ? w.a : w.b)!;
      const q = pos.get(w.a === nodeId ? w.b : w.a)!;
      if (!p || !q || dist(p, q) < 1) continue;
      let diff = Math.abs(angleOf(sub(q, p)) - dirOut) % (2 * Math.PI);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      // Collinear (straight on, ~180°) or folded back (~0°): skip.
      if (diff > Math.PI - 0.15 || diff < 0.15) continue;
      best = Math.max(best, w.thickness / 2);
    }
    return best;
  };
  return { extA: ext(wall.a, a, b), extB: ext(wall.b, b, a) };
}

/** Unit direction of a wall in plan. */
export function wallDir(level: Level, wall: Wall) {
  const a = level.nodes.find((n) => n.id === wall.a)!.pos;
  const b = level.nodes.find((n) => n.id === wall.b)!.pos;
  return { a, b, d: norm(sub(b, a)), length: dist(a, b) };
}
