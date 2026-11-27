// Small builders the seed project is written with: walls, openings, markers, room names, chimney breasts.
import type { Id, Level, Opening, Vec2, WallKind, Structural, Marker } from './types';
import { addWall, findWallNear, wallEnds } from '../geometry/wallGraph';
import { CATALOGUE } from '../catalogue/items';
import { newPlacedItem } from '../catalogue/catalogue';
import { detectRooms, syncRooms } from '../geometry/rooms';
import { dot, norm, perpL, pointInPolygon, projectOnSegment, sub, dist } from '../geometry/vec';
import { uid } from './ids';

type P = [number, number];
const pt = (p: P): Vec2 => ({ x: p[0], y: p[1] });

const T: Record<WallKind, number> = { external: 330, party: 230, internal: 100 };

export function emptyLevel(id: Id, name: string, elevation: number, ceilingHeight: number): Level {
  return {
    id,
    name,
    elevation,
    ceilingHeight,
    nodes: [],
    walls: [],
    rooms: [],
    items: [],
    stairs: [],
    markers: [],
    estimated: true,
  };
}

export function wall(
  level: Level,
  a: P,
  b: P,
  kind: WallKind,
  opts: { thickness?: number; structural?: Structural } = {},
): void {
  addWall(level, pt(a), pt(b), {
    kind,
    thickness: opts.thickness ?? T[kind],
    structural: opts.structural ?? 'unknown',
    estimated: true,
  });
}

/**
 * Put an opening between two points on a wall. For doors, `into` is a point
 * in the room the door swings into and `hinge` is the end (p or q) with the
 * hinges.
 */
export function opening(
  level: Level,
  type: Opening['type'],
  p: P,
  q: P,
  opts: { height?: number; sill?: number; into?: P; hinge?: 'p' | 'q' } = {},
): void {
  const P1 = pt(p);
  const Q1 = pt(q);
  const w = level.walls.find((x) => {
    const [a, b] = wallEnds(level, x);
    return projectOnSegment(P1, a, b).dist < 1 && projectOnSegment(Q1, a, b).dist < 1;
  });
  if (!w) throw new Error(`Seed: no wall under opening ${p} -> ${q} on ${level.name}`);
  const [a, b] = wallEnds(level, w);
  const dp = dist(a, P1);
  const dq = dist(a, Q1);
  const near = dp < dq ? P1 : Q1;
  const o: Opening = {
    id: uid('o'),
    type,
    offset: Math.round(dist(a, near)),
    width: Math.round(Math.abs(dq - dp)),
    height: opts.height ?? (type === 'window' || type === 'bayWindow' ? 1500 : 2000),
    sill: opts.sill ?? (type === 'window' || type === 'bayWindow' ? 800 : 0),
    estimated: true,
    existing: true,
  };
  if (type === 'door') {
    const d = norm(sub(b, a));
    const into = pt(opts.into ?? [0, 0]);
    const side = dot(sub(into, near), perpL(d)) > 0 ? 'left' : 'right';
    const hingePoint = opts.hinge === 'q' ? Q1 : P1;
    const hinge = dist(a, hingePoint) <= Math.min(dp, dq) + 1 ? 'start' : 'end';
    o.swing = { hinge, side, angle: 90 };
  }
  w.openings.push(o);
}

export function marker(level: Level, p: P, text: string): void {
  const m: Marker = { id: uid('m'), pos: pt(p), text };
  level.markers!.push(m);
}

export function nameRooms(level: Level, names: { at: P; name: string }[]): void {
  const detected = detectRooms(level);
  syncRooms(level, detected);
  for (const { at, name } of names) {
    const d = detected.find((r) => !r.solid && pointInPolygon(pt(at), r.inner));
    if (!d) throw new Error(`Seed: no room at ${at} for ${name}`);
    const room = level.rooms.find((r) => r.boundary.join('|') === d.nodeIds.join('|'));
    if (room) room.name = name;
  }
}

/** Chimney breast: a box of walls against the left party wall. */
export function chimneyBreast(level: Level, y0: number, y1: number, depth = 320): void {
  const fx = depth - 50; // centreline of the 100 mm breast face
  wall(level, [-115, y0 + 50], [fx, y0 + 50], 'party', { thickness: 100 });
  wall(level, [fx, y0 + 50], [fx, y1 - 50], 'party', { thickness: 100 });
  wall(level, [fx, y1 - 50], [-115, y1 - 50], 'party', { thickness: 100 });
}

/**
 * The chimney breast as a catalogue piece too, so it can be resized and counted by the
 * rules: a masonry box on the left party wall from y0 to y1, up to the ceiling. The size
 * is a guess from the plan, so it is marked estimated until measured.
 */
export function chimneyItem(level: Level, y0: number, y1: number, depth = 320): void {
  const cat = CATALOGUE.find((c) => c.id === 'chimney-breast')!;
  const mid = (y0 + y1) / 2;
  const it = newPlacedItem(cat, { x: depth / 2, y: mid }, 270); // back to the party wall, front into the room
  it.dims = { w: y1 - y0, d: depth, h: level.ceilingHeight };
  it.estimated = true;
  const hit = findWallNear(level, { x: -115, y: mid }, 5);
  if (hit) {
    const [a] = wallEnds(level, hit.wall);
    it.mountedTo = { wallId: hit.wall.id, offset: Math.round(dist(a, hit.point)) };
  }
  level.items.push(it);
}
