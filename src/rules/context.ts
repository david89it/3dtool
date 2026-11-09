// What the rules can ask about a level: where items are, how much free floor
// there is beside them, which room they're in, door swings and windows.
//
// The wall-derived part (outlines, rooms, door swings, window zones) is
// computed once per level geometry and reused while the fixer tries out
// item positions; only the item part is rebuilt.

import type { CatalogueItem, Id, Level, PlacedItem, Project, Room, Vec2, Wall } from '../model/types';
import { computeJoints, type JointData, type WallOutline } from '../geometry/joints';
import { detectRooms, type DetectedRoom } from '../geometry/rooms';
import { add, dot, mul, perpL, perpR, pointInPolygon, segmentIntersect, sub } from '../geometry/vec';
import {
  effectiveDims,
  findCatalogueItem,
  footprint,
  footprintCentre,
  isFloorObstacle,
  itemAxes,
  topHeight,
  bottomHeight,
  type Dims,
} from '../catalogue/catalogue';
import { convexOverlap } from './poly';

export type Side = 'front' | 'back' | 'left' | 'right';

/** A placed item with everything the rules need, worked out once. */
export interface Placed {
  item: PlacedItem;
  cat: CatalogueItem;
  poly: Vec2[]; // footprint: back-left, back-right, front-right, front-left
  centre: Vec2;
  dims: Dims;
  front: Vec2;
  xAxis: Vec2;
  obstacle: boolean;
  top: number;
  bottom: number;
}

export interface DoorSwing {
  wallId: Id;
  openingId: Id;
  hinge: Vec2;
  radius: number;
  sector: Vec2[]; // convex: hinge then the arc
}

export interface WindowZone {
  wallId: Id;
  openingId: Id;
  sill: number;
  /** One zone on each face of the wall: the window span, from the face outwards. */
  faces: { base: [Vec2, Vec2]; normal: Vec2 }[];
}

interface Face {
  wallId: Id;
  p: Vec2;
  q: Vec2;
  outline: WallOutline;
  /** Spans along the wall (mm from node a) you can walk through: doors and cased openings. */
  pass: [number, number][];
}

export interface LevelGeometry {
  joints: JointData;
  rooms: DetectedRoom[];
  wallPolys: { wallId: Id; poly: Vec2[] }[];
  faces: Face[];
  doors: DoorSwing[];
  windows: WindowZone[];
}

export interface Hit {
  dist: number;
  wallId?: Id;
  item?: Placed;
}

export type Fmt = (mm: number) => string;
export type RuleOverrides = Record<string, Partial<Record<string, number>>>;

export const MAX_RAY = 5000;

/** Openings low enough to walk through. */
const isPassable = (sill: number) => sill < 100;

export function buildGeometry(level: Level): LevelGeometry {
  const joints = computeJoints(level);
  const rooms = detectRooms(level, joints).filter((r) => !r.solid);
  const wallPolys: LevelGeometry['wallPolys'] = [];
  const faces: Face[] = [];
  const doors: DoorSwing[] = [];
  const windows: WindowZone[] = [];

  for (const w of level.walls) {
    const o = joints.outlines.get(w.id);
    if (!o) continue;
    wallPolys.push({ wallId: w.id, poly: o.poly });
    const pass = w.openings.filter((x) => isPassable(x.sill)).map((x) => [x.offset, x.offset + x.width] as [number, number]);
    faces.push({ wallId: w.id, p: o.aL, q: o.bL, outline: o, pass });
    faces.push({ wallId: w.id, p: o.aR, q: o.bR, outline: o, pass });
    // End caps block too (they matter at free ends of walls).
    faces.push({ wallId: w.id, p: o.aL, q: o.aR, outline: o, pass: [] });
    faces.push({ wallId: w.id, p: o.bL, q: o.bR, outline: o, pass: [] });
    doors.push(...doorSwings(w, o));
    windows.push(...windowZones(w, o));
  }
  return { joints, rooms, wallPolys, faces, doors, windows };
}

function doorSwings(w: Wall, o: WallOutline): DoorSwing[] {
  const out: DoorSwing[] = [];
  const half = w.thickness / 2;
  for (const op of w.openings) {
    if (op.type !== 'door') continue;
    const sw = op.swing ?? { hinge: 'start', side: 'left', angle: 90 };
    const sideN = sw.side === 'left' ? perpL(o.dir) : perpR(o.dir);
    const sign = sw.side === 'left' ? 1 : -1;
    const s = op.offset;
    const e = op.offset + op.width;
    const n = perpL(o.dir);
    const at = (along: number, across: number) => add(add(o.a, mul(o.dir, along)), mul(n, across));
    const H = at(sw.hinge === 'start' ? s : e, sign * half);
    const J = at(sw.hinge === 'start' ? e : s, sign * half);
    const r = op.width;
    const a0 = Math.atan2(J.y - H.y, J.x - H.x);
    const a1 = Math.atan2(sideN.y, sideN.x);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const sweep = da * Math.min(1, (sw.angle ?? 90) / 90);
    const sector: Vec2[] = [H];
    for (let i = 0; i <= 12; i++) {
      const t = a0 + (sweep * i) / 12;
      sector.push({ x: H.x + Math.cos(t) * r, y: H.y + Math.sin(t) * r });
    }
    out.push({ wallId: w.id, openingId: op.id, hinge: H, radius: r, sector });
  }
  return out;
}

function windowZones(w: Wall, o: WallOutline): WindowZone[] {
  const out: WindowZone[] = [];
  const half = w.thickness / 2;
  const n = perpL(o.dir);
  for (const op of w.openings) {
    if (op.type !== 'window' && op.type !== 'bayWindow') continue;
    const at = (along: number, across: number) => add(add(o.a, mul(o.dir, along)), mul(n, across));
    out.push({
      wallId: w.id,
      openingId: op.id,
      sill: op.sill,
      faces: [
        { base: [at(op.offset, half), at(op.offset + op.width, half)], normal: n },
        { base: [at(op.offset, -half), at(op.offset + op.width, -half)], normal: mul(n, -1) },
      ],
    });
  }
  return out;
}

export function makePlaced(item: PlacedItem, cat: CatalogueItem): Placed {
  const { front, xAxis } = itemAxes(item);
  return {
    item,
    cat,
    poly: footprint(item, cat),
    centre: footprintCentre(item, cat),
    dims: effectiveDims(item, cat),
    front,
    xAxis,
    obstacle: isFloorObstacle(item, cat),
    top: topHeight(item, cat),
    bottom: bottomHeight(item, cat),
  };
}

export interface SideEdge {
  a: Vec2;
  b: Vec2;
  normal: Vec2;
}

/** The edge of the footprint on one side, and the outward direction. */
export function sideEdge(p: Placed, side: Side): SideEdge {
  const [bl, br, fr, fl] = p.poly;
  switch (side) {
    case 'front':
      return { a: fl, b: fr, normal: p.front };
    case 'back':
      return { a: bl, b: br, normal: mul(p.front, -1) };
    case 'left':
      return { a: bl, b: fl, normal: mul(p.xAxis, -1) };
    case 'right':
      return { a: br, b: fr, normal: p.xAxis };
  }
}

export class RuleContext {
  readonly placed: Placed[];
  readonly byId: Map<Id, Placed>;

  constructor(
    readonly level: Level,
    readonly project: Pick<Project, 'catalogueOverrides'>,
    readonly geo: LevelGeometry,
    readonly overrides: RuleOverrides = {},
    readonly fmt: Fmt = (mm) => `${Math.round(mm)} mm`,
    items: PlacedItem[] = level.items,
  ) {
    this.placed = [];
    for (const it of items) {
      const cat = findCatalogueItem(project, it.catalogueId);
      if (cat) this.placed.push(makePlaced(it, cat));
    }
    this.byId = new Map(this.placed.map((p) => [p.item.id, p]));
  }

  /** The same level with some items moved (used by the fixer). */
  withItems(items: PlacedItem[]): RuleContext {
    return new RuleContext(this.level, this.project, this.geo, this.overrides, this.fmt, items);
  }

  params(ruleId: string, defaults: Record<string, number>): Record<string, number> {
    const o = this.overrides[ruleId] ?? {};
    const out: Record<string, number> = { ...defaults };
    for (const [k, v] of Object.entries(o)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    return out;
  }

  roomOf(p: Placed): { room?: Room; detected?: DetectedRoom; name: string } {
    const d = this.geo.rooms
      .filter((r) => pointInPolygon(p.centre, r.inner))
      .sort((a, b) => a.area - b.area)[0];
    if (!d) return { name: 'Not in a room' };
    const key = d.nodeIds.join('|');
    const room = this.level.rooms.find((r) => r.boundary.join('|') === key);
    return { room, detected: d, name: room?.name ?? 'Room' };
  }

  roomsOfWall(wallId: Id): { room?: Room; name: string }[] {
    const out: { room?: Room; name: string }[] = [];
    for (const d of this.geo.rooms) {
      if (!d.edges.some((e) => e.wallId === wallId)) continue;
      const room = this.level.rooms.find((r) => r.boundary.join('|') === d.nodeIds.join('|'));
      out.push({ room, name: room?.name ?? 'Room' });
    }
    return out;
  }

  /** Distance along a ray to the first wall face or floor obstacle. */
  cast(origin: Vec2, dir: Vec2, self: Placed | null, ignore?: (q: Placed) => boolean): Hit {
    const end = add(origin, mul(dir, MAX_RAY));
    let best: Hit = { dist: MAX_RAY };
    for (const f of this.geo.faces) {
      const hit = segmentIntersect(origin, end, f.p, f.q);
      if (!hit) continue;
      const d = hit.t * MAX_RAY;
      if (d >= best.dist) continue;
      if (f.pass.length) {
        const along = dot(sub(hit.point, f.outline.a), f.outline.dir);
        if (f.pass.some(([s, e]) => along > s + 1 && along < e - 1)) continue;
      }
      best = { dist: d, wallId: f.wallId };
    }
    for (const q of this.placed) {
      if (q === self || !q.obstacle || (ignore && ignore(q))) continue;
      for (let i = 0; i < 4; i++) {
        const hit = segmentIntersect(origin, end, q.poly[i], q.poly[(i + 1) % 4]);
        if (!hit) continue;
        const d = hit.t * MAX_RAY;
        if (d < best.dist) best = { dist: d, item: q, wallId: undefined };
      }
    }
    return best;
  }

  /**
   * Free floor beyond one side of an item, from three rays at 15, 50 and
   * 85% along that edge. `how` combines them: 'min' (default, the tightest
   * point) or 'median' (ignores one short ray, e.g. a bedside table at the
   * head end of a bed).
   */
  clearDepth(p: Placed, side: Side, opts: { ignore?: (q: Placed) => boolean; how?: 'min' | 'median' } = {}): Hit {
    const e = sideEdge(p, side);
    const hits = [0.15, 0.5, 0.85].map((t) => {
      const o = add({ x: e.a.x + (e.b.x - e.a.x) * t, y: e.a.y + (e.b.y - e.a.y) * t }, mul(e.normal, 0.5));
      const h = this.cast(o, e.normal, p, opts.ignore);
      return { ...h, dist: h.dist + 0.5 };
    });
    hits.sort((a, b) => a.dist - b.dist);
    return opts.how === 'median' ? hits[1] : hits[0];
  }

  /** Does a polygon overlap any wall, or any floor obstacle other than `skip`? */
  overlapsSomething(poly: Vec2[], skip: Set<Id>): boolean {
    for (const w of this.geo.wallPolys) if (convexOverlap(poly, w.poly, 2)) return true;
    for (const q of this.placed) {
      if (skip.has(q.item.id) || !q.obstacle) continue;
      if (convexOverlap(poly, q.poly, 2)) return true;
    }
    return false;
  }

  hitName(h: Hit): string {
    if (h.item) return h.item.cat.name.toLowerCase();
    if (h.wallId) return 'wall';
    return 'open space';
  }
}

export function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

export function capFirst(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

