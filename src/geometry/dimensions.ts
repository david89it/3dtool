// Dimension labels: the length of the wall face that she would measure with a
// tape inside a room, and the edit that makes a wall that long.

import type { Id, Level, Vec2 } from '../model/types';
import type { JointData } from './joints';
import type { DetectedRoom } from './rooms';
import { add, mul, perpL, perpR } from './vec';
import { degree, nodePos, setNodePos, clampOpenings, wallsAt } from './wallGraph';
import { computeJoints } from './joints';
import { detectRooms } from './rooms';

export interface WallDimension {
  wallId: Id;
  side: 'L' | 'R';
  length: number; // mm, internal face
  mid: Vec2; // midpoint of that face
  normal: Vec2; // unit, pointing away from the wall on that side
  angleDeg: number; // text rotation along the wall, kept readable
}

/**
 * Pick the face to label for each wall: the face that bounds a room (the
 * shorter one if both do). Walls with no room get their shorter face.
 */
export function wallDimensions(level: Level, joints: JointData, rooms: DetectedRoom[]): WallDimension[] {
  const sides = new Map<Id, Set<'L' | 'R'>>();
  for (const r of rooms) {
    if (r.solid) continue;
    for (const e of r.edges) {
      const w = level.walls.find((x) => x.id === e.wallId);
      if (!w) continue;
      const side: 'L' | 'R' = e.from === w.a ? 'L' : 'R';
      if (!sides.has(w.id)) sides.set(w.id, new Set());
      sides.get(w.id)!.add(side);
    }
  }
  const solidWalls = new Set<Id>();
  for (const r of rooms) if (r.solid) for (const e of r.edges) solidWalls.add(e.wallId);
  const out: WallDimension[] = [];
  for (const w of level.walls) {
    const o = joints.outlines.get(w.id);
    if (!o) continue;
    const s = sides.get(w.id);
    // A wall hidden behind a solid mass (e.g. behind a chimney breast) has no face to measure.
    if (!s && solidWalls.has(w.id)) continue;
    let side: 'L' | 'R';
    if (s && s.size === 1) side = [...s][0];
    else side = o.faceL <= o.faceR ? 'L' : 'R';
    const length = side === 'L' ? o.faceL : o.faceR;
    const p = side === 'L' ? o.aL : o.aR;
    const q = side === 'L' ? o.bL : o.bR;
    const mid = mul(add(p, q), 0.5);
    const normal = side === 'L' ? perpL(o.dir) : perpR(o.dir);
    let angleDeg = (Math.atan2(o.dir.y, o.dir.x) * 180) / Math.PI;
    if (angleDeg > 90) angleDeg -= 180;
    if (angleDeg <= -90) angleDeg += 180;
    out.push({ wallId: w.id, side, length, mid, normal, angleDeg });
  }
  return out;
}

/**
 * Make the labelled face of a wall `target` mm long by moving one end along
 * the wall: the free end if there is one, otherwise end b. Walls at that end
 * which are square to this wall move with it (so a rectangular room stays
 * rectangular); other connected walls stretch because they share the node.
 * `measure` returns the current face length; a few passes absorb the change
 * in corner mitres.
 */
export function setInternalLength(
  level: Level,
  wallId: Id,
  target: number,
  measure: (level: Level) => number,
): void {
  const w = level.walls.find((x) => x.id === wallId);
  if (!w || target <= 0) return;
  const moveA = degree(level, w.a) === 1 && degree(level, w.b) > 1;
  const fixed = moveA ? w.b : w.a;
  const moving = moveA ? w.a : w.b;
  const F = nodePos(level, fixed);
  const M0 = nodePos(level, moving);
  const L0 = Math.hypot(M0.x - F.x, M0.y - F.y);
  if (L0 < 1) return;
  const d = { x: (M0.x - F.x) / L0, y: (M0.y - F.y) / L0 };
  const carry = new Set<Id>([moving]);
  for (const other of wallsAt(level, moving)) {
    if (other.id === w.id) continue;
    const far = other.a === moving ? other.b : other.a;
    if (far === fixed) continue;
    const P = nodePos(level, far);
    const od = { x: P.x - M0.x, y: P.y - M0.y };
    const ol = Math.hypot(od.x, od.y);
    if (ol > 0 && Math.abs((od.x * d.x + od.y * d.y) / ol) < 0.09) carry.add(far);
  }
  for (let pass = 0; pass < 4; pass++) {
    const delta = target - measure(level);
    if (Math.abs(delta) < 0.01) break;
    for (const id of carry) {
      const p = nodePos(level, id);
      setNodePos(level, id, { x: p.x + d.x * delta, y: p.y + d.y * delta });
    }
  }
  w.estimated = false;
  clampOpenings(level);
}

/** Current labelled face length of one wall. */
export function measureWallFace(level: Level, wallId: Id): number {
  const J = computeJoints(level);
  const d = wallDimensions(level, J, detectRooms(level, J)).find((x) => x.wallId === wallId);
  return d ? d.length : 0;
}
