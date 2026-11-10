// Wall graph operations. Every function mutates the Level it is given, so it
// can run inside an immer recipe (store) or on a plain object (seed, tests).

import type { Id, Level, Opening, Vec2, Wall, WallKind, Structural } from '../model/types';
import { uid } from '../model/ids';
import { add, dist, mul, norm, projectOnSegment, segmentIntersect, sub } from './vec';

export interface WallProps {
  thickness: number;
  kind: WallKind;
  structural: Structural;
  height?: number;
  estimated?: boolean;
}

export const DEFAULT_THICKNESS: Record<WallKind, number> = {
  internal: 100,
  external: 330,
  party: 230,
};

export function defaultWallProps(kind: WallKind = 'internal'): WallProps {
  return { thickness: DEFAULT_THICKNESS[kind], kind, structural: 'unknown' };
}

export function nodePos(level: Level, id: Id): Vec2 {
  const n = level.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`Missing node ${id}`);
  return n.pos;
}

export function wallEnds(level: Level, wall: Wall): [Vec2, Vec2] {
  return [nodePos(level, wall.a), nodePos(level, wall.b)];
}

export function wallLength(level: Level, wall: Wall): number {
  const [a, b] = wallEnds(level, wall);
  return dist(a, b);
}

export function wallsAt(level: Level, nodeId: Id): Wall[] {
  return level.walls.filter((w) => w.a === nodeId || w.b === nodeId);
}

export function degree(level: Level, nodeId: Id): number {
  return wallsAt(level, nodeId).length;
}

export function addNode(level: Level, pos: Vec2): Id {
  const id = uid('n');
  level.nodes.push({ id, pos: { x: pos.x, y: pos.y } });
  return id;
}

export function findNodeNear(level: Level, pos: Vec2, tol: number, exclude?: Id): Id | undefined {
  let best: Id | undefined;
  let bestD = tol;
  for (const n of level.nodes) {
    if (n.id === exclude) continue;
    const d = dist(n.pos, pos);
    if (d <= bestD) {
      bestD = d;
      best = n.id;
    }
  }
  return best;
}

/** Closest wall whose interior (not its end points) is within tol of pos. */
export function findWallNear(
  level: Level,
  pos: Vec2,
  tol: number,
  excludeNode?: Id,
): { wall: Wall; t: number; point: Vec2 } | undefined {
  let best: { wall: Wall; t: number; point: Vec2 } | undefined;
  let bestD = tol;
  for (const w of level.walls) {
    if (excludeNode && (w.a === excludeNode || w.b === excludeNode)) continue;
    const [a, b] = wallEnds(level, w);
    const pr = projectOnSegment(pos, a, b);
    if (pr.t <= 1e-6 || pr.t >= 1 - 1e-6) continue;
    if (pr.dist <= bestD) {
      bestD = pr.dist;
      best = { wall: w, t: pr.t, point: pr.point };
    }
  }
  return best;
}

/**
 * Split a wall at the point closest to pos. Returns the id of the node at
 * the split (an existing end node if the point is at an end). Openings are
 * kept with the piece they sit in; a split never cuts through an opening.
 */
export function splitWall(level: Level, wallId: Id, pos: Vec2): Id {
  const wall = level.walls.find((w) => w.id === wallId);
  if (!wall) throw new Error(`Missing wall ${wallId}`);
  const [a, b] = wallEnds(level, wall);
  const L = dist(a, b);
  let s = projectOnSegment(pos, a, b).t * L;
  for (const o of wall.openings) {
    if (s > o.offset && s < o.offset + o.width) {
      s = s - o.offset < o.offset + o.width - s ? o.offset : o.offset + o.width;
    }
  }
  if (s <= 1) return wall.a;
  if (s >= L - 1) return wall.b;
  const point = add(a, mul(norm(sub(b, a)), s));
  const nid = addNode(level, point);
  const first: Opening[] = [];
  const second: Opening[] = [];
  for (const o of wall.openings) {
    if (o.offset + o.width <= s + 1e-6) first.push(o);
    else second.push({ ...o, offset: o.offset - s });
  }
  const piece: Wall = { ...wall, id: uid('w'), a: nid, b: wall.b, openings: second, ...(wall.faces ? { faces: { ...wall.faces } } : {}) };
  wall.b = nid;
  wall.openings = first;
  const idx = level.walls.indexOf(wall);
  level.walls.splice(idx + 1, 0, piece);
  return nid;
}

/** Resolve a point to a node: reuse a nearby node, split a wall it lands on, or add one. */
export function resolvePoint(level: Level, pos: Vec2, tol = 1): Id {
  const near = findNodeNear(level, pos, tol);
  if (near) return near;
  const onWall = findWallNear(level, pos, tol);
  if (onWall) return splitWall(level, onWall.wall.id, onWall.point);
  return addNode(level, pos);
}

function wallBetween(level: Level, a: Id, b: Id): Wall | undefined {
  return level.walls.find((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a));
}

/**
 * Add a wall between two points. The new wall is split wherever it touches
 * an existing node or crosses an existing wall (which is split too), so the
 * plan stays a proper graph and rooms can be found. Returns new wall ids.
 */
export function addWall(
  level: Level,
  from: Vec2 | Id,
  to: Vec2 | Id,
  props: WallProps,
  tol = 1,
): Id[] {
  const aId = typeof from === 'string' ? from : resolvePoint(level, from, tol);
  const bId = typeof to === 'string' ? to : resolvePoint(level, to, tol);
  if (aId === bId) return [];
  const A = nodePos(level, aId);
  const B = nodePos(level, bId);
  const L = dist(A, B);
  if (L < 1) return [];

  const cuts: { t: number; id: Id }[] = [
    { t: 0, id: aId },
    { t: 1, id: bId },
  ];
  // Existing nodes lying on the new segment.
  for (const n of level.nodes) {
    if (n.id === aId || n.id === bId) continue;
    const pr = projectOnSegment(n.pos, A, B);
    if (pr.dist <= tol && pr.t > 1e-6 && pr.t < 1 - 1e-6) cuts.push({ t: pr.t, id: n.id });
  }
  // Existing walls crossing the new segment.
  for (const w of [...level.walls]) {
    if (w.a === aId || w.b === aId || w.a === bId || w.b === bId) continue;
    const [c, d] = wallEnds(level, w);
    const hit = segmentIntersect(A, B, c, d);
    if (!hit) continue;
    const eps = tol / Math.max(L, 1);
    if (hit.t <= eps || hit.t >= 1 - eps) continue;
    const wl = dist(c, d);
    if (hit.u * wl <= tol || (1 - hit.u) * wl <= tol) continue; // touches at an end node: covered above
    const nid = splitWall(level, w.id, hit.point);
    cuts.push({ t: hit.t, id: nid });
  }
  cuts.sort((p, q) => p.t - q.t);
  const created: Id[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const p = cuts[i].id;
    const q = cuts[i + 1].id;
    if (p === q || wallBetween(level, p, q)) continue;
    const id = uid('w');
    level.walls.push({
      id,
      a: p,
      b: q,
      thickness: props.thickness,
      kind: props.kind,
      structural: props.structural,
      ...(props.height !== undefined ? { height: props.height } : {}),
      ...(props.estimated ? { estimated: true } : {}),
      openings: [],
    });
    created.push(id);
  }
  return created;
}

export function removeOrphanNodes(level: Level): void {
  const used = new Set<Id>();
  for (const w of level.walls) {
    used.add(w.a);
    used.add(w.b);
  }
  level.nodes = level.nodes.filter((n) => used.has(n.id));
}

export function deleteWall(level: Level, wallId: Id): void {
  level.walls = level.walls.filter((w) => w.id !== wallId);
  removeOrphanNodes(level);
}

/** Merge node `drop` into node `keep`; walls that collapse or duplicate are removed. */
export function mergeNodes(level: Level, keep: Id, drop: Id): void {
  if (keep === drop) return;
  for (const w of level.walls) {
    if (w.a === drop) w.a = keep;
    if (w.b === drop) w.b = keep;
  }
  const seen = new Set<string>();
  level.walls = level.walls.filter((w) => {
    if (w.a === w.b) return false;
    const key = w.a < w.b ? `${w.a}|${w.b}` : `${w.b}|${w.a}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  level.nodes = level.nodes.filter((n) => n.id !== drop);
  removeOrphanNodes(level);
}

/**
 * After a node has been dragged: if it now sits on another node, merge them;
 * if it sits on a wall, split that wall and join it there.
 */
export function settleNode(level: Level, nodeId: Id, tol: number): void {
  const pos = nodePos(level, nodeId);
  const other = findNodeNear(level, pos, tol, nodeId);
  if (other) {
    mergeNodes(level, other, nodeId);
    return;
  }
  const onWall = findWallNear(level, pos, tol, nodeId);
  if (onWall) {
    const nid = splitWall(level, onWall.wall.id, onWall.point);
    mergeNodes(level, nid, nodeId);
  }
}

export function setNodePos(level: Level, nodeId: Id, pos: Vec2): void {
  const n = level.nodes.find((x) => x.id === nodeId);
  if (n) n.pos = { x: pos.x, y: pos.y };
}

/** Keep every opening inside its wall after the wall got shorter. */
export function clampOpenings(level: Level): void {
  for (const w of level.walls) {
    const L = wallLength(level, w);
    for (const o of w.openings) {
      if (o.width > L) o.width = Math.max(0, Math.floor(L));
      if (o.offset < 0) o.offset = 0;
      if (o.offset + o.width > L) o.offset = Math.max(0, L - o.width);
    }
  }
}

/** Walls in this level that the given walls are connected to (for highlighting). */
export function connectedWalls(level: Level, wallId: Id): Wall[] {
  const w = level.walls.find((x) => x.id === wallId);
  if (!w) return [];
  return level.walls.filter((x) => x.id !== wallId && (x.a === w.a || x.b === w.a || x.a === w.b || x.b === w.b));
}
