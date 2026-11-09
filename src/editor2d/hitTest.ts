import type { Id, Level, Vec2 } from '../model/types';
import type { JointData } from '../geometry/joints';
import type { DetectedRoom } from '../geometry/rooms';
import type { WallDimension } from '../geometry/dimensions';
import { dist, pointInPolygon, projectOnSegment } from '../geometry/vec';
import { toScreen, type View } from './view';

/** 44 px targets: anything within 22 px of the pointer counts as a hit. */
export const HIT_PX = 22;

export function dimLabelScreenPos(v: View, d: WallDimension): Vec2 {
  const s = toScreen(v, d.mid);
  return { x: s.x + d.normal.x * 15, y: s.y + d.normal.y * 15 };
}

export function hitDimLabel(v: View, dims: WallDimension[], screen: Vec2): WallDimension | undefined {
  let best: WallDimension | undefined;
  let bestD = 18;
  for (const d of dims) {
    const p = dimLabelScreenPos(v, d);
    const dd = dist(p, screen);
    if (dd < bestD) {
      bestD = dd;
      best = d;
    }
  }
  return best;
}

export function hitNode(level: Level, v: View, screen: Vec2, onlyIds?: Set<Id>): Id | undefined {
  let best: Id | undefined;
  let bestD = 16;
  for (const n of level.nodes) {
    if (onlyIds && !onlyIds.has(n.id)) continue;
    const d = dist(toScreen(v, n.pos), screen);
    if (d < bestD) {
      bestD = d;
      best = n.id;
    }
  }
  return best;
}

export function hitWall(level: Level, J: JointData, v: View, world: Vec2): Id | undefined {
  const tolMm = 10 / v.scale;
  let best: Id | undefined;
  let bestD = Infinity;
  for (const w of level.walls) {
    const o = J.outlines.get(w.id);
    if (!o) continue;
    const pr = projectOnSegment(world, o.a, o.b);
    const inside = pointInPolygon(world, o.poly);
    const reach = Math.max(w.thickness / 2, tolMm);
    if (inside || pr.dist <= reach) {
      if (pr.dist < bestD) {
        bestD = pr.dist;
        best = w.id;
      }
    }
  }
  return best;
}

export function hitMarker(level: Level, v: View, screen: Vec2): Id | undefined {
  for (const m of level.markers ?? []) {
    if (dist(toScreen(v, m.pos), screen) <= HIT_PX) return m.id;
  }
  return undefined;
}

export function hitRoom(rooms: DetectedRoom[], world: Vec2): DetectedRoom | undefined {
  // Smallest room first so a cupboard inside a bigger outline wins.
  const sorted = rooms.filter((r) => !r.solid).sort((a, b) => a.area - b.area);
  return sorted.find((r) => pointInPolygon(world, r.inner));
}
