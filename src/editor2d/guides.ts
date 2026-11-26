// Smart distance guides for moving furniture. Pure geometry.
//
// For a piece's footprint we find the nearest obstacle (wall face or other
// piece) in each of its own four directions (front, back, left, right), so it
// also works for pieces turned 15° or 30°. We also find alignment with other
// pieces (centre lines and edges) and offer snapping. Everything works in the
// piece's local frame: x to its right, z to its front.

import type { CatalogueItem, Clearance, Id, Level, PlacedItem, Project, Vec2 } from '../model/types';
import type { JointData } from '../geometry/joints';
import { effectiveDims, findCatalogueItem, footprint, footprintCentre, isFloorObstacle, itemAxes, obstacleRects } from '../catalogue/catalogue';

/** Farthest we look for something to measure to (mm). */
export const GUIDE_RANGE = 3000;
/** Pointer-independent snap tolerances. */
export const GAP_SNAP_MM = 20;
const MAX_ALIGN_LINES = 4;

export type Side = 'front' | 'back' | 'left' | 'right';
export const SIDES: Side[] = ['front', 'back', 'left', 'right'];
/** Red: closer than the catalogue's minimum. Amber: between minimum and ideal. */
export type GapStatus = 'ok' | 'low' | 'tight';

export interface Obstacle {
  id: string;
  kind: 'wall' | 'item';
  poly: Vec2[];
}

export interface ItemRect {
  c: Vec2;
  xAxis: Vec2;
  front: Vec2;
  w: number;
  d: number;
}

export interface DistanceGuide {
  side: Side;
  gap: number;
  /** On the piece's edge. */
  from: Vec2;
  /** On the obstacle. */
  to: Vec2;
  kind: 'wall' | 'item';
  targetId: string;
  status: GapStatus;
}

export interface AlignLine {
  from: Vec2;
  to: Vec2;
}

export interface GuideSet {
  distances: DistanceGuide[];
  aligns: AlignLine[];
}

export function itemRect(item: PlacedItem, cat: CatalogueItem): ItemRect {
  const { w, d } = effectiveDims(item, cat);
  const { xAxis, front } = itemAxes(item);
  return { c: footprintCentre(item, cat), xAxis, front, w, d };
}

const toPlan = (r: ItemRect, x: number, z: number): Vec2 => ({
  x: r.c.x + r.xAxis.x * x + r.front.x * z,
  y: r.c.y + r.xAxis.y * x + r.front.y * z,
});
const toLocal = (r: ItemRect, p: Vec2): Vec2 => {
  const dx = p.x - r.c.x;
  const dy = p.y - r.c.y;
  return { x: dx * r.xAxis.x + dy * r.xAxis.y, y: dx * r.front.x + dy * r.front.y };
};

/** Keep the part of a polygon where keep(p) >= 0 (Sutherland-Hodgman, one half-plane). */
function clipPoly(poly: Vec2[], f: (p: Vec2) => number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const fa = f(a);
    const fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/** Local direction for a side: which local axis it runs along and its sign. */
const DIR: Record<Side, { axis: 'x' | 'z'; sign: 1 | -1 }> = {
  front: { axis: 'z', sign: 1 },
  back: { axis: 'z', sign: -1 },
  right: { axis: 'x', sign: 1 },
  left: { axis: 'x', sign: -1 },
};

export function clearanceLimits(clearance: Clearance[], side: Side): { min: number; ideal: number } | null {
  let min = -1;
  let ideal = -1;
  for (const c of clearance) {
    if (c.side !== side && c.side !== 'all') continue;
    min = Math.max(min, c.min);
    ideal = Math.max(ideal, c.ideal);
  }
  return min < 0 ? null : { min, ideal: Math.max(min, ideal) };
}

export function gapStatus(gap: number, lim: { min: number; ideal: number } | null): GapStatus {
  if (!lim) return 'ok';
  if (gap < lim.min) return 'tight';
  if (gap < lim.ideal) return 'low';
  return 'ok';
}

/**
 * Nearest obstacle in each of the piece's four directions, cast from the
 * footprint edge (the whole edge, so a wall that only overlaps part of it
 * still counts). Gaps of 0 (touching or overlapping) or beyond `range` give
 * no guide.
 */
export function rayDistances(rect: ItemRect, obstacles: Obstacle[], clearance: Clearance[] = [], range = GUIDE_RANGE): DistanceGuide[] {
  const out: DistanceGuide[] = [];
  const reach = Math.hypot(rect.w, rect.d) / 2 + range;
  const near = obstacles.filter((o) => inReach(o.poly, rect, reach));
  const local = near.map((o) => ({ o, poly: o.poly.map((p) => toLocal(rect, p)) }));
  for (const side of SIDES) {
    const { axis, sign } = DIR[side];
    const half = (axis === 'z' ? rect.d : rect.w) / 2;
    const slab = (axis === 'z' ? rect.w : rect.d) / 2 - 1; // 1 mm in: a piece standing flush beside us is not ahead of us
    const fw = (p: Vec2) => sign * (axis === 'z' ? p.y : p.x);
    const lat = (p: Vec2) => (axis === 'z' ? p.x : p.y);
    let best: { gap: number; l: number; o: Obstacle } | null = null;
    for (const { o, poly } of local) {
      let q = clipPoly(poly, (p) => lat(p) + slab);
      if (q.length) q = clipPoly(q, (p) => slab - lat(p));
      if (q.length) q = clipPoly(q, (p) => fw(p) - half);
      if (q.length < 3) continue;
      const minF = Math.min(...q.map(fw));
      const gap = minF - half;
      if (gap > range || (best && gap >= best.gap)) continue;
      const ls = q.filter((p) => fw(p) <= minF + 1).map(lat);
      best = { gap, l: (Math.min(...ls) + Math.max(...ls)) / 2, o };
    }
    if (!best || best.gap < 1 || best.gap > range) continue;
    const at = (f: number): Vec2 => (axis === 'z' ? toPlan(rect, best!.l, sign * f) : toPlan(rect, sign * f, best!.l));
    out.push({
      side,
      gap: best.gap,
      from: at(half),
      to: at(half + best.gap),
      kind: best.o.kind,
      targetId: best.o.id,
      status: gapStatus(best.gap, clearanceLimits(clearance, side)),
    });
  }
  return out;
}

/** Is the polygon's bounding box within reach of the piece? */
function inReach(poly: Vec2[], rect: ItemRect, reach: number): boolean {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  return x0 <= rect.c.x + reach && x1 >= rect.c.x - reach && y0 <= rect.c.y + reach && y1 >= rect.c.y - reach;
}

// ---------------------------------------------------------------- alignment

export interface AlignTarget {
  id: string;
  poly: Vec2[];
}

export interface AlignResult {
  /** Shift in the piece's local frame needed to line up (0 when nothing is within tolerance). */
  dx: number;
  dz: number;
  /** Which axes found something. */
  hitX: boolean;
  hitZ: boolean;
}

interface Cand {
  /** Target feature minus the piece's feature: the shift that lines them up. */
  delta: number;
  id: string;
}

/**
 * Line the piece's centre line or edges up with another piece's centre line
 * or edges (in the moving piece's own axes). `tol` is in mm; pass the pixel
 * tolerance divided by the zoom.
 */
export function alignSnap(rect: ItemRect, targets: AlignTarget[], tol: number, lock: { x?: boolean; z?: boolean } = {}): AlignResult {
  const mine = {
    x: [-rect.w / 2, 0, rect.w / 2],
    z: [-rect.d / 2, 0, rect.d / 2],
  };
  const best: { x: Cand | null; z: Cand | null } = { x: null, z: null };
  for (const t of targets) {
    const pts = t.poly.map((p) => toLocal(rect, p));
    const xs = pts.map((p) => p.x);
    const zs = pts.map((p) => p.y);
    const lo = { x: Math.min(...xs), z: Math.min(...zs) };
    const hi = { x: Math.max(...xs), z: Math.max(...zs) };
    for (const axis of ['x', 'z'] as const) {
      if (lock[axis]) continue;
      const feats = [lo[axis], (lo[axis] + hi[axis]) / 2, hi[axis]];
      for (const f of feats) {
        for (const m of mine[axis]) {
          const delta = f - m;
          if (Math.abs(delta) <= tol && (!best[axis] || Math.abs(delta) < Math.abs(best[axis]!.delta))) best[axis] = { delta, id: t.id };
        }
      }
    }
  }
  return { dx: best.x?.delta ?? 0, dz: best.z?.delta ?? 0, hitX: !!best.x, hitZ: !!best.z };
}

/** Dashed lines across the piece and each target it lines up with (call with the final, snapped rect). */
export function alignLines(rect: ItemRect, targets: AlignTarget[], eps = 1): AlignLine[] {
  const out: AlignLine[] = [];
  const mine = {
    x: [-rect.w / 2, 0, rect.w / 2],
    z: [-rect.d / 2, 0, rect.d / 2],
  };
  for (const t of targets) {
    const pts = t.poly.map((p) => toLocal(rect, p));
    for (const axis of ['x', 'z'] as const) {
      const other = axis === 'x' ? 'z' : 'x';
      const vals = pts.map((p) => (axis === 'x' ? p.x : p.y));
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      const ovals = pts.map((p) => (other === 'x' ? p.x : p.y));
      const o0 = Math.min(...ovals, other === 'x' ? -rect.w / 2 : -rect.d / 2);
      const o1 = Math.max(...ovals, other === 'x' ? rect.w / 2 : rect.d / 2);
      const hit = [lo, (lo + hi) / 2, hi].find((f) => mine[axis].some((m) => Math.abs(f - m) <= eps));
      if (hit === undefined) continue;
      out.push({
        from: axis === 'x' ? toPlan(rect, hit, o0) : toPlan(rect, o0, hit),
        to: axis === 'x' ? toPlan(rect, hit, o1) : toPlan(rect, o1, hit),
      });
      if (out.length >= MAX_ALIGN_LINES) return out;
    }
  }
  return out;
}

// ------------------------------------------------------------------ obstacles

type WallCache = { nodes: Level['nodes']; obstacles: Obstacle[] };
const wallCache = new WeakMap<Level['walls'], WallCache>();
const itemCache = new WeakMap<PlacedItem, { cat: CatalogueItem; parts: Vec2[][]; fp: Vec2[] | null }>();

/** Wall outlines (and junction fillers) as obstacles. Cached on the walls array so a drag does not rebuild them. */
export function wallObstacles(level: Level, J: JointData): Obstacle[] {
  const hit = wallCache.get(level.walls);
  if (hit && hit.nodes === level.nodes) return hit.obstacles;
  const obstacles: Obstacle[] = [];
  for (const o of J.outlines.values()) obstacles.push({ id: o.wallId, kind: 'wall', poly: o.poly });
  for (const h of J.hubs) obstacles.push({ id: `hub-${h.nodeId}`, kind: 'wall', poly: h.poly });
  wallCache.set(level.walls, { nodes: level.nodes, obstacles });
  return obstacles;
}

function itemGeometry(item: PlacedItem, cat: CatalogueItem) {
  let g = itemCache.get(item);
  if (!g || g.cat !== cat) {
    const floor = cat.mount !== 'ceiling' && isFloorObstacle(item, cat);
    g = { cat, parts: floor ? obstacleRects(item, cat) : [], fp: floor ? footprint(item, cat) : null };
    itemCache.set(item, g);
  }
  return g;
}

export interface GuideWorld {
  obstacles: Obstacle[];
  targets: AlignTarget[];
}

/** Everything a piece can measure to or line up with, leaving out `exclude`. */
export function guideWorld(level: Level, project: Pick<Project, 'catalogueOverrides'>, J: JointData, exclude: Iterable<Id>): GuideWorld {
  const skip = new Set(exclude);
  const obstacles = [...wallObstacles(level, J)];
  const targets: AlignTarget[] = [];
  for (const it of level.items) {
    if (skip.has(it.id)) continue;
    const cat = findCatalogueItem(project, it.catalogueId);
    if (!cat) continue;
    const g = itemGeometry(it, cat);
    for (const poly of g.parts) obstacles.push({ id: it.id, kind: 'item', poly });
    if (g.fp) targets.push({ id: it.id, poly: g.fp });
  }
  return { obstacles, targets };
}

// ---------------------------------------------------------------- the whole thing

export interface MoveGuideOpts {
  /** Zoom (px per mm), for the zoom-independent alignment tolerance. */
  scale: number;
  /** Alt held: no snapping. */
  snap: boolean;
  /** The piece is already flush to a wall at its back (or is wall-mounted): leave its front/back position alone. */
  lockZ?: boolean;
  /** Wall-mounted and parametric pieces keep their own snapping. */
  noSnap?: boolean;
}

export interface MoveGuides extends GuideSet {
  /** Shift to apply to the piece's position (plan, mm). */
  shift: Vec2;
}

export const ALIGN_TOL_PX = 6;

/** Round gaps to 10 mm and pull them to the catalogue's minimum or ideal when close. */
export function snapGap(gap: number, lim: { min: number; ideal: number } | null): number {
  if (lim) {
    let best: number | null = null;
    for (const v of [lim.min, lim.ideal]) {
      if (Math.abs(gap - v) <= GAP_SNAP_MM && (best === null || Math.abs(gap - v) < Math.abs(gap - best))) best = v;
    }
    if (best !== null) return best;
  }
  return Math.round(gap / 10) * 10;
}

/** Guides, and the snapping shift, for a piece being moved to `rect`. */
export function computeMoveGuides(rect: ItemRect, cat: CatalogueItem, world: GuideWorld, opts: MoveGuideOpts): MoveGuides {
  let r = rect;
  let local = { x: 0, z: 0 };
  const canSnap = opts.snap && !opts.noSnap;
  const lock = { z: !!opts.lockZ };
  let aligned = { x: false, z: false };
  if (canSnap) {
    const a = alignSnap(rect, world.targets, ALIGN_TOL_PX / opts.scale, lock);
    local = { x: a.dx, z: a.dz };
    aligned = { x: a.hitX, z: a.hitZ };
    r = { ...rect, c: toPlan(rect, a.dx, a.dz) };
  }
  let distances = rayDistances(r, world.obstacles, cat.clearance);
  if (canSnap) {
    // Per axis, round the gap to the nearest wall (unless that axis just lined up with a piece).
    let moved = false;
    for (const axis of ['x', 'z'] as const) {
      if (aligned[axis] || (axis === 'z' && lock.z)) continue;
      const cands = distances.filter((g) => g.kind === 'wall' && DIR[g.side].axis === axis);
      if (cands.length === 0) continue;
      const g = cands.reduce((a, b) => (b.gap < a.gap ? b : a));
      const want = snapGap(g.gap, clearanceLimits(cat.clearance, g.side));
      const move = (g.gap - want) * DIR[g.side].sign;
      if (Math.abs(move) < 0.01) continue;
      local = { ...local, [axis]: local[axis] + move };
      moved = true;
    }
    if (moved) {
      r = { ...rect, c: toPlan(rect, local.x, local.z) };
      distances = rayDistances(r, world.obstacles, cat.clearance);
    }
  }
  const shift = { x: rect.xAxis.x * local.x + rect.front.x * local.z, y: rect.xAxis.y * local.x + rect.front.y * local.z };
  return { shift, distances, aligns: canSnap ? alignLines(r, world.targets) : [] };
}

/** Distances for a piece that is not being dragged (shown while it stays selected). */
export function guidesForItem(level: Level, project: Pick<Project, 'catalogueOverrides'>, J: JointData, itemId: Id): DistanceGuide[] {
  const item = level.items.find((i) => i.id === itemId);
  const cat = item && findCatalogueItem(project, item.catalogueId);
  if (!item || !cat || cat.mount === 'ceiling') return [];
  const world = guideWorld(level, project, J, [itemId]);
  return rayDistances(itemRect(item, cat), world.obstacles, cat.clearance);
}

/** Unit plan vector pointing out of the piece on `side`. */
export function sideVector(item: Pick<PlacedItem, 'rotationDeg'>, side: Side): Vec2 {
  const { xAxis, front } = itemAxes(item);
  const { axis, sign } = DIR[side];
  const v = axis === 'x' ? xAxis : front;
  return { x: v.x * sign, y: v.y * sign };
}

/** New position that makes the gap on `side` equal `gap` (moves the piece along that direction). */
export function moveToGap(item: PlacedItem, side: Side, current: number, gap: number): Vec2 {
  const v = sideVector(item, side);
  const t = current - gap;
  return { x: Math.round((item.pos.x + v.x * t) * 10) / 10, y: Math.round((item.pos.y + v.y * t) * 10) / 10 };
}
