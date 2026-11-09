// Pure walkthrough physics in plan millimetres: what you collide with, how
// high the floor is under you, and which floor you are on. No three.js.

import type { Level, Project, Stair, Vec2 } from '../model/types';
import { add, mul, norm, pointInPolygon, projectOnSegment, rotate, sub } from '../geometry/vec';
import { findCatalogueItem, footprint, isFloorObstacle } from '../catalogue/catalogue';

export const PLAYER_RADIUS = 250;
export const EYE_HEIGHT = 1600;
export const WALK_SPEED = 1400; // mm per second
/** You can step onto a floor up to this much above your feet. */
export const STEP_UP = 400;

export interface Segment {
  a: Vec2;
  b: Vec2;
  half: number; // half the wall thickness
}

export interface Obstacles {
  segments: Segment[];
  polygons: Vec2[][];
}

/** Openings you can walk through: doors and cased openings that reach the floor and are tall enough. */
function passable(o: { type: string; sill: number; height: number }): boolean {
  return (o.type === 'door' || o.type === 'opening') && o.sill <= 50 && o.height >= 1800;
}

/** Walls (minus door and opening gaps) and furniture you can bump into on a level. */
export function levelObstacles(level: Level, project: Pick<Project, 'catalogueOverrides'>): Obstacles {
  const pos = new Map(level.nodes.map((n) => [n.id, n.pos] as const));
  const segments: Segment[] = [];
  for (const w of level.walls) {
    const a = pos.get(w.a);
    const b = pos.get(w.b);
    if (!a || !b) continue;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1) continue;
    const d = norm(sub(b, a));
    const gaps = w.openings
      .filter(passable)
      .map((o) => [Math.max(0, o.offset), Math.min(L, o.offset + o.width)] as [number, number])
      .sort((p, q) => p[0] - q[0]);
    let cursor = 0;
    for (const [g0, g1] of gaps) {
      if (g0 > cursor) segments.push({ a: add(a, mul(d, cursor)), b: add(a, mul(d, g0)), half: w.thickness / 2 });
      cursor = Math.max(cursor, g1);
    }
    if (cursor < L) segments.push({ a: add(a, mul(d, cursor)), b, half: w.thickness / 2 });
  }
  const polygons: Vec2[][] = [];
  for (const it of level.items) {
    const cat = findCatalogueItem(project, it.catalogueId);
    if (!cat || !isFloorObstacle(it, cat)) continue;
    polygons.push(footprint(it, cat));
  }
  return { segments, polygons };
}

/** Push a circle of radius r at p out of every obstacle. A few passes settle corners. */
export function resolveCollision(p: Vec2, obs: Obstacles, r = PLAYER_RADIUS): Vec2 {
  let q = { ...p };
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const s of obs.segments) {
      const pr = projectOnSegment(q, s.a, s.b);
      const reach = r + s.half;
      if (pr.dist < reach) {
        let n = sub(q, pr.point);
        if (pr.dist < 1e-6) n = { x: -(s.b.y - s.a.y), y: s.b.x - s.a.x };
        q = add(pr.point, mul(norm(n), reach));
        moved = true;
      }
    }
    for (const poly of obs.polygons) {
      const inside = pointInPolygon(q, poly);
      let best: { point: Vec2; dist: number } | null = null;
      for (let i = 0; i < poly.length; i++) {
        const pr = projectOnSegment(q, poly[i], poly[(i + 1) % poly.length]);
        if (!best || pr.dist < best.dist) best = pr;
      }
      if (!best) continue;
      if (inside) {
        const out = norm(sub(best.point, q));
        q = add(best.point, mul(out, r));
        moved = true;
      } else if (best.dist < r) {
        q = add(best.point, mul(norm(sub(q, best.point)), r));
        moved = true;
      }
    }
    if (!moved) break;
  }
  return q;
}

export interface StairRamp {
  stair: Stair;
  from: number; // floor height (mm) at the stair's local -x end
  to: number; // at the local +x end
}

/** Every stair as a ramp between its level's floor and the target level's floor. */
export function stairRamps(levels: Level[]): StairRamp[] {
  const byId = new Map(levels.map((l) => [l.id, l] as const));
  const out: StairRamp[] = [];
  for (const L of levels) {
    for (const s of L.stairs) {
      const target = byId.get(s.toLevelId);
      if (!target) continue;
      out.push({ stair: s, from: L.elevation, to: target.elevation });
    }
  }
  return out;
}

/** Height of the ramp under p, or null if p is not on this stair. */
export function rampHeight(r: StairRamp, p: Vec2): number | null {
  const local = rotate(sub(p, r.stair.pos), -r.stair.rotationDeg);
  const { length, width } = r.stair;
  if (Math.abs(local.x) > length / 2 || Math.abs(local.y) > width / 2) return null;
  const t = (local.x + length / 2) / length;
  return r.from + (r.to - r.from) * t;
}

/**
 * Floor height under the player. On a stair whose ramp is within reach of
 * your feet you follow the ramp; otherwise you stand on the highest floor
 * at or below your feet + STEP_UP.
 */
export function floorHeightAt(p: Vec2, feet: number, levels: Level[], ramps: StairRamp[]): number {
  let best: number | null = null;
  for (const r of ramps) {
    const h = rampHeight(r, p);
    if (h === null || Math.abs(h - feet) > STEP_UP + 50) continue;
    if (best === null || Math.abs(h - feet) < Math.abs(best - feet)) best = h;
  }
  if (best !== null) return best;
  return levelUnderFeet(feet, levels)?.elevation ?? 0;
}

/** The floor you are standing on: the highest level at or below your feet + STEP_UP. */
export function levelUnderFeet(feet: number, levels: Level[]): Level | undefined {
  let pick: Level | undefined;
  for (const L of levels) {
    if (L.elevation <= feet + STEP_UP && (!pick || L.elevation > pick.elevation)) pick = L;
  }
  return pick ?? [...levels].sort((a, b) => a.elevation - b.elevation)[0];
}

