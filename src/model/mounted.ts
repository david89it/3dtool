// Wall-hung items follow their wall. When a wall or one of its corners moves,
// its thickness changes, or it is split, every item with `mountedTo` keeps its
// offset along the wall (clamped to the wall's length) and stays flat on the
// same face. Recomputes position and rotation from the wall geometry. If the
// wall is gone, the item is left where it is and `mountedTo` is cleared.
//
// Pure functions over plain data. The store calls `followMountedItems` inside
// the same recipe as the wall edit, so it is one undo step.

import type { Id, Level, Vec2, Wall } from './types';
import { itemAxes } from '../catalogue/catalogue';

const rotationFacing = (n: Vec2): number => {
  const deg = (Math.atan2(-n.x, n.y) * 180) / Math.PI;
  return Math.round(((deg % 360) + 360) % 360);
};

interface Frame {
  a: Vec2;
  dir: Vec2;
  length: number;
  thickness: number;
}

function frameOf(level: Level, w: Wall): Frame | null {
  const a = level.nodes.find((n) => n.id === w.a)?.pos;
  const b = level.nodes.find((n) => n.id === w.b)?.pos;
  if (!a || !b) return null;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 1e-6) return null;
  return { a, dir: { x: (b.x - a.x) / length, y: (b.y - a.y) / length }, length, thickness: w.thickness };
}

const same = (p: Frame, q: Frame) =>
  Math.abs(p.a.x - q.a.x) < 1e-6 &&
  Math.abs(p.a.y - q.a.y) < 1e-6 &&
  Math.abs(p.dir.x - q.dir.x) < 1e-9 &&
  Math.abs(p.dir.y - q.dir.y) < 1e-9 &&
  Math.abs(p.length - q.length) < 1e-6 &&
  p.thickness === q.thickness;

/**
 * Update the mounted items of `after` (edited in place) to follow walls that
 * changed since `before`. Items on walls that did not change are untouched.
 */
export function followMountedItems(before: Level, after: Level): void {
  if (!after.items.some((i) => i.mountedTo)) return;
  const beforeWalls = new Map(before.walls.map((w) => [w.id, w] as const));
  const afterWalls = new Map(after.walls.map((w) => [w.id, w] as const));

  for (const it of after.items) {
    const m = it.mountedTo;
    if (!m) continue;
    const bw = beforeWalls.get(m.wallId);
    if (!bw) continue; // was never on a wall we know: leave it alone
    const bf = frameOf(before, bw);
    let wallId: Id = m.wallId;
    let offset = m.offset;
    let aw = afterWalls.get(wallId);

    // Split: the original id keeps the first piece, a new wall takes the rest.
    if (aw && bw && aw.b !== bw.b && aw.a === bw.a) {
      const piece = after.walls.find((w) => !beforeWalls.has(w.id) && w.a === aw!.b && w.b === bw.b);
      const first = frameOf(after, aw);
      if (piece && first && offset > first.length) {
        wallId = piece.id;
        offset -= first.length;
        aw = piece;
      }
    }

    if (!aw) {
      it.mountedTo = undefined;
      continue;
    }
    const af = frameOf(after, aw);
    if (!af) {
      it.mountedTo = undefined;
      continue;
    }
    if (wallId === m.wallId && bf && same(bf, af)) continue; // wall did not change

    // Which face: the one the item's front looks away from (from the old state).
    let sign = 1;
    if (bf) {
      const { front } = itemAxes(it);
      const nL = { x: -bf.dir.y, y: bf.dir.x };
      sign = front.x * nL.x + front.y * nL.y >= 0 ? 1 : -1;
    }
    const n = { x: sign * -af.dir.y, y: sign * af.dir.x };
    const t = Math.min(Math.max(offset, 0), af.length);
    const lift = af.thickness / 2 + it.dims.d / 2;
    it.pos = {
      x: af.a.x + af.dir.x * t + n.x * lift,
      y: af.a.y + af.dir.y * t + n.y * lift,
    };
    it.rotationDeg = rotationFacing(n);
    it.mountedTo = { wallId, offset: Math.round(t) };
  }
}
