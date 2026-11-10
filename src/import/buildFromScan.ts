// Turn scanned surfaces into walls, doors, windows and rooms on a floor.
// Mutates the level (use inside an immer recipe).
//
// - The scan is turned so its walls run square to the page (RoomPlan's
//   axes are wherever the phone started) and moved so it lands on top of
//   the existing plan, or at the origin on an empty floor.
// - Wall ends within 150 mm of each other become one corner; ends near
//   another wall join it (T-junctions).
// - A scan is a measurement: nothing it creates is marked estimated, and
//   its openings count as existing (no structural badge).

import type { Level, OpeningType, Vec2 } from '../model/types';
import { addWall, clampOpenings, wallEnds } from '../geometry/wallGraph';
import { detectRooms, syncRooms } from '../geometry/rooms';
import { dot, projectOnSegment, sub, norm, dist } from '../geometry/vec';
import { uid } from '../model/ids';
import type { ScanSurface } from './roomplan';

export const JOIN_MM = 150;

export interface ScanSummary {
  walls: number;
  doors: number;
  windows: number;
  openings: number;
  rooms: number;
  area: number; // mm², all detected rooms
  skipped: number; // doors/windows that matched no wall
}

function rot(p: Vec2, a: number): Vec2 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Angle that turns the walls square to the page (4-fold average of wall directions). */
export function squaringAngle(walls: ScanSurface[]): number {
  let sx = 0;
  let sy = 0;
  for (const w of walls) {
    const a = Math.atan2(w.dir.y, w.dir.x) * 4;
    sx += Math.cos(a) * w.length;
    sy += Math.sin(a) * w.length;
  }
  if (sx === 0 && sy === 0) return 0;
  return -Math.atan2(sy, sx) / 4;
}

/** Bounding box of a level's walls (corner positions), or null if it has none. */
export function wallBounds(level: Level): { min: Vec2; max: Vec2 } | null {
  if (level.nodes.length === 0) return null;
  const xs = level.nodes.map((n) => n.pos.x);
  const ys = level.nodes.map((n) => n.pos.y);
  return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } };
}

/** Replace a level's walls with the scan. `anchor` is where the scan's top-left corner goes. */
export function buildFromScan(level: Level, surfaces: ScanSurface[], anchor: Vec2 = { x: 0, y: 0 }): ScanSummary {
  const wallsIn = surfaces.filter((s) => s.kind === 'wall' && s.length > 200);
  if (wallsIn.length === 0) throw new Error('No walls found in this scan.');

  // Square up and move.
  const a = squaringAngle(wallsIn);
  const turned = surfaces.map((s) => ({ ...s, centre: rot(s.centre, a), dir: norm(rot(s.dir, a)) }));
  const tWalls = turned.filter((s) => s.kind === 'wall' && s.length > 200);
  const ends = tWalls.flatMap((w) => [
    { x: w.centre.x - (w.dir.x * w.length) / 2, y: w.centre.y - (w.dir.y * w.length) / 2 },
    { x: w.centre.x + (w.dir.x * w.length) / 2, y: w.centre.y + (w.dir.y * w.length) / 2 },
  ]);
  const minX = Math.min(...ends.map((p) => p.x));
  const minY = Math.min(...ends.map((p) => p.y));
  const shift = { x: anchor.x - minX, y: anchor.y - minY };
  const move = (p: Vec2): Vec2 => ({ x: Math.round(p.x + shift.x), y: Math.round(p.y + shift.y) });
  const pts = ends.map(move);

  // Join nearby ends into shared corners (average of each cluster).
  const cluster = pts.map((_, i) => i);
  const find = (i: number): number => (cluster[i] === i ? i : (cluster[i] = find(cluster[i])));
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) if (dist(pts[i], pts[j]) <= JOIN_MM) cluster[find(i)] = find(j);
  const sums = new Map<number, { x: number; y: number; n: number }>();
  pts.forEach((p, i) => {
    const r = find(i);
    const s = sums.get(r) ?? { x: 0, y: 0, n: 0 };
    s.x += p.x;
    s.y += p.y;
    s.n += 1;
    sums.set(r, s);
  });
  const joined = pts.map((_, i) => {
    const s = sums.get(find(i))!;
    return { x: Math.round(s.x / s.n), y: Math.round(s.y / s.n) };
  });

  // Replace the walls (furniture, pins, stairs and the plan image stay).
  level.nodes = [];
  level.walls = [];
  level.rooms = [];
  const heights: number[] = [];
  tWalls.forEach((w, i) => {
    const thickness = w.thickness >= 30 ? Math.round(w.thickness) : 100;
    heights.push(w.height);
    addWall(level, joined[i * 2], joined[i * 2 + 1], { kind: 'internal', thickness, structural: 'unknown', height: Math.round(w.height) }, JOIN_MM);
  });
  if (heights.length) {
    const sorted = [...heights].sort((p, q) => p - q);
    level.ceilingHeight = Math.round(sorted[Math.floor(sorted.length / 2)]);
  }

  // Doors, windows and openings onto the nearest parallel wall.
  const counts = { door: 0, window: 0, opening: 0, skipped: 0 };
  for (const s of turned) {
    if (s.kind === 'wall') continue;
    const c = move(s.centre);
    let best: { wallId: string; along: number; d: number } | null = null;
    for (const w of level.walls) {
      const [p, q] = wallEnds(level, w);
      const wd = norm(sub(q, p));
      if (Math.abs(dot(wd, s.dir)) < 0.9) continue;
      const pr = projectOnSegment(c, p, q);
      if (pr.dist > 400) continue;
      if (!best || pr.dist < best.d) best = { wallId: w.id, along: pr.t * dist(p, q), d: pr.dist };
    }
    if (!best) {
      counts.skipped++;
      continue;
    }
    const wall = level.walls.find((w) => w.id === best!.wallId)!;
    const type: OpeningType = s.kind === 'door' ? 'door' : s.kind === 'window' ? 'window' : 'opening';
    const width = Math.round(s.length);
    wall.openings.push({
      id: uid('o'),
      type,
      offset: Math.max(0, Math.round(best.along - width / 2)),
      width,
      height: Math.round(s.height),
      sill: type === 'window' ? Math.max(0, Math.round(s.bottom)) : 0,
      existing: true,
      ...(type === 'door' ? { swing: { hinge: 'start' as const, side: 'left' as const, angle: 90 } } : {}),
    });
    counts[s.kind === 'door' ? 'door' : s.kind === 'window' ? 'window' : 'opening']++;
  }
  clampOpenings(level);

  // Rooms.
  syncRooms(level);
  level.rooms.forEach((r, i) => (r.name = `Scanned room ${i + 1}`));
  const detected = detectRooms(level).filter((r) => !r.solid);

  return {
    walls: level.walls.length,
    doors: counts.door,
    windows: counts.window,
    openings: counts.opening,
    rooms: detected.length,
    area: detected.reduce((t, r) => t + r.area, 0),
    skipped: counts.skipped,
  };
}

export function describeSummary(s: ScanSummary): string {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const parts = [n(s.walls, 'wall', 'walls'), n(s.doors, 'door', 'doors'), n(s.windows, 'window', 'windows')];
  if (s.openings) parts.push(n(s.openings, 'opening', 'openings'));
  const rooms = `${n(s.rooms, 'room', 'rooms')} (${(s.area / 1e6).toFixed(1)} m²)`;
  const skipped = s.skipped ? ` ${n(s.skipped, 'door or window was', 'doors or windows were')} not on a wall and left out.` : '';
  return `Found ${parts.join(', ')}, ${rooms}.${skipped}`;
}
