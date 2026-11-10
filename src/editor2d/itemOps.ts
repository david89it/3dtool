// Furniture edits that need plan geometry: snapping against walls,
// resizing from an edge, duplicating. Pure functions over plain data so
// they can run inside immer recipes and in tests.

import type { CatalogueItem, Id, Level, PlacedItem, Vec2 } from '../model/types';
import type { JointData } from '../geometry/joints';
import { uid } from '../model/ids';
import { dot, perpL, perpR, sub } from '../geometry/vec';
import { effectiveDims, itemAxes } from '../catalogue/catalogue';

export interface WallFace {
  wallId: Id;
  start: Vec2;
  end: Vec2;
  normal: Vec2; // points away from the wall, into the space in front of the face
  wallA: Vec2; // wall centreline start (for mountedTo offsets)
  dir: Vec2;
}

export function wallFaces(level: Level, J: JointData): WallFace[] {
  const out: WallFace[] = [];
  for (const w of level.walls) {
    const o = J.outlines.get(w.id);
    if (!o) continue;
    out.push({ wallId: w.id, start: o.aL, end: o.bL, normal: perpL(o.dir), wallA: o.a, dir: o.dir });
    out.push({ wallId: w.id, start: o.aR, end: o.bR, normal: perpR(o.dir), wallA: o.a, dir: o.dir });
  }
  return out;
}

/** Rotation (degrees, clockwise) that makes an item's front face along `n`. */
export function rotationFacing(n: Vec2): number {
  const deg = (Math.atan2(-n.x, n.y) * 180) / Math.PI;
  return Math.round(((deg % 360) + 360) % 360);
}

const sameAngle = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return d < 2;
};

export interface WallSnap {
  pos: Vec2;
  rotationDeg: number;
  mountedTo: { wallId: Id; offset: number };
  distance: number;
}

/**
 * Put an item's back flush against the nearest wall face. `pos` is the
 * item's base centre. With `autoRotate` any face counts and the item turns
 * to face away from it; otherwise only faces it already backs onto.
 */
export function snapToWall(
  faces: WallFace[],
  pos: Vec2,
  rotationDeg: number,
  dims: { w: number; d: number },
  opts: { tol: number; autoRotate: boolean },
): WallSnap | null {
  let best: WallSnap | null = null;
  for (const f of faces) {
    const along = sub(f.end, f.start);
    const len = Math.hypot(along.x, along.y);
    if (len < 50) continue;
    const u = { x: along.x / len, y: along.y / len };
    const rel = sub(pos, f.start);
    const s = dot(rel, f.normal); // distance in front of the face
    let t = dot(rel, u);
    // (No clamping along the face: walls are often split into collinear
    // pieces, and the item may rightly run past the end of one piece.)
    if (t < -dims.w / 4 || t > len + dims.w / 4) continue;
    const rot = rotationFacing(f.normal);
    if (!opts.autoRotate && !sameAngle(rot, rotationDeg)) continue;
    if (s < -dims.d / 2) continue; // behind the wall
    const gap = Math.abs(s - dims.d / 2);
    if (gap > opts.tol) continue;
    t = Math.round(t / 10) * 10;
    const p = {
      x: f.start.x + u.x * t + f.normal.x * (dims.d / 2),
      y: f.start.y + u.y * t + f.normal.y * (dims.d / 2),
    };
    if (!best || gap < best.distance) {
      best = {
        pos: p,
        rotationDeg: rot,
        mountedTo: { wallId: f.wallId, offset: Math.round(dot(sub(p, f.wallA), f.dir)) },
        distance: gap,
      };
    }
  }
  return best;
}

export const round10 = (p: Vec2): Vec2 => ({ x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 });

export type Edge = 'left' | 'right' | 'front' | 'back';

export function clampDim(cat: CatalogueItem, axis: 'w' | 'd' | 'h', v: number, current: number): number {
  const r = cat.resizable[axis];
  if (!r) return current;
  return Math.round(Math.min(r[1], Math.max(r[0], v)) / 10) * 10;
}

export function canResize(cat: CatalogueItem, axis: 'w' | 'd' | 'h'): boolean {
  return !!cat.resizable[axis];
}

/**
 * Resize from one edge, keeping the opposite edge where it is. `target` is
 * the wanted size of that dimension as it looks now (current state). The
 * stored base size is clamped to the catalogue range.
 */
export function resizeFromEdge(item: PlacedItem, cat: CatalogueItem, edge: Edge, target: number): PlacedItem {
  const eff = effectiveDims(item, cat);
  const { front, xAxis } = itemAxes(item);
  if (edge === 'left' || edge === 'right') {
    const ratio = eff.w / item.dims.w;
    const w = clampDim(cat, 'w', target / ratio, item.dims.w);
    const grow = (w - item.dims.w) * ratio;
    const sign = edge === 'right' ? 1 : -1;
    return {
      ...item,
      dims: { ...item.dims, w },
      pos: { x: item.pos.x + xAxis.x * sign * (grow / 2), y: item.pos.y + xAxis.y * sign * (grow / 2) },
    };
  }
  const ratio = eff.d / item.dims.d;
  const d = clampDim(cat, 'd', target / ratio, item.dims.d);
  const D = item.dims.d;
  const back = { x: item.pos.x - front.x * (D / 2), y: item.pos.y - front.y * (D / 2) };
  let b2 = back;
  if (edge === 'back') {
    // Keep the front edge (as it is now) fixed: the back moves.
    const frontEdge = { x: back.x + front.x * D * ratio, y: back.y + front.y * D * ratio };
    b2 = { x: frontEdge.x - front.x * d * ratio, y: frontEdge.y - front.y * d * ratio };
  }
  return { ...item, dims: { ...item.dims, d }, pos: { x: b2.x + front.x * (d / 2), y: b2.y + front.y * (d / 2) } };
}

/** Set one dimension from the panel: width grows from the centre, depth from the back. */
export function setDimension(item: PlacedItem, cat: CatalogueItem, axis: 'w' | 'd' | 'h', value: number): PlacedItem {
  if (axis === 'h') return { ...item, dims: { ...item.dims, h: clampDim(cat, 'h', value, item.dims.h) } };
  if (axis === 'w') {
    const w = clampDim(cat, 'w', value, item.dims.w);
    return { ...item, dims: { ...item.dims, w } };
  }
  const ratio = effectiveDims(item, cat).d / item.dims.d;
  return resizeFromEdge(item, cat, 'front', value * ratio);
}

export function duplicateItem(item: PlacedItem): PlacedItem {
  return {
    ...item,
    id: uid('i'),
    pos: { x: item.pos.x + 300, y: item.pos.y + 300 },
    dims: { ...item.dims },
    locked: false,
    mountedTo: undefined,
  };
}

/** Turn 90 degrees clockwise about the item's centre. */
export function rotateBy(item: PlacedItem, deg: number): PlacedItem {
  return { ...item, rotationDeg: (((item.rotationDeg + deg) % 360) + 360) % 360, mountedTo: undefined };
}

export interface OpeningSnap {
  pos: Vec2;
  rotationDeg: number;
  mountedTo: { wallId: Id; offset: number };
  gapW: number;
  gapH: number;
  distance: number;
}

/**
 * For a bookcase surround: centre it on the nearest door, window or opening
 * in a wall, backed against the face on the pointer's side. The gap takes
 * the opening's width and height.
 */
export function snapToOpening(level: Level, J: JointData, pointer: Vec2, depth: number, side: number, tol: number): OpeningSnap | null {
  let best: OpeningSnap | null = null;
  for (const w of level.walls) {
    if (w.openings.length === 0) continue;
    const o = J.outlines.get(w.id);
    if (!o) continue;
    for (const n of [perpL(o.dir), perpR(o.dir)]) {
      for (const op of w.openings) {
        const along = op.offset + op.width / 2;
        const base = {
          x: o.a.x + o.dir.x * along + n.x * (w.thickness / 2),
          y: o.a.y + o.dir.y * along + n.y * (w.thickness / 2),
        };
        const rel = sub(pointer, base);
        const s = dot(rel, n);
        const t = dot(rel, o.dir);
        if (s < -20) continue; // pointer is on the other side of the wall
        const beyond = Math.max(0, Math.abs(t) - op.width / 2 - side);
        if (beyond > tol || s > depth + tol) continue;
        const distance = Math.max(0, s - depth) + beyond;
        if (!best || distance < best.distance) {
          best = {
            pos: { x: base.x + n.x * (depth / 2), y: base.y + n.y * (depth / 2) },
            rotationDeg: rotationFacing(n),
            mountedTo: { wallId: w.id, offset: Math.round(along) },
            gapW: Math.round(op.width),
            gapH: Math.round(op.height),
            distance,
          };
        }
      }
    }
  }
  return best;
}

/** Ceiling height over a point: the room's own setting, else the floor's. */
export function ceilingAt(level: Level, rooms: { nodeIds: Id[]; inner: Vec2[]; solid: boolean }[], p: Vec2): number {
  const r = rooms.find((x) => !x.solid && pointInPolygonLocal(p, x.inner));
  const stored = r && level.rooms.find((x) => x.boundary.join('|') === r.nodeIds.join('|'));
  return stored?.ceilingHeight ?? level.ceilingHeight;
}

function pointInPolygonLocal(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Apply an opening snap to a surround: centred, sized to the opening, up to just under the ceiling. */
export function fitSurround(item: PlacedItem, snap: OpeningSnap, side: number, ceiling: number): PlacedItem {
  return {
    ...item,
    pos: snap.pos,
    rotationDeg: snap.rotationDeg,
    mountedTo: snap.mountedTo,
    params: { ...(item.params ?? {}), gapW: snap.gapW, gapH: snap.gapH },
    dims: { ...item.dims, w: snap.gapW + 2 * side, h: Math.max(snap.gapH + 250, ceiling - 50) },
  };
}
