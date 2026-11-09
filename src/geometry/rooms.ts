// Room detection: every closed loop of walls is a room.
//
// Faces of the planar wall graph are traced with half-edges: arriving at a
// node, leave by the next wall clockwise from the one you came in on. That
// keeps the face on your left, so inner faces have positive signed area and
// the unbounded outside face is negative and dropped. Area is measured on
// the internal wall faces (from the mitred outlines), not the centrelines.

import type { Id, Level, Room, Vec2 } from '../model/types';
import { uid } from '../model/ids';
import { computeJoints, type JointData } from './joints';
import { angleOf, dist, labelPoint, signedArea, sub } from './vec';

/** Loops smaller than this (internal area) are solid masses such as a chimney breast void. */
export const SOLID_AREA_MM2 = 0.4e6;

export interface DetectedRoom {
  key: string;
  nodeIds: Id[];
  edges: { wallId: Id; from: Id; to: Id }[];
  centre: Vec2[];
  inner: Vec2[];
  area: number; // mm², internal faces
  label: Vec2;
  solid: boolean;
}

interface HalfEdge {
  from: Id;
  to: Id;
  wallId: Id;
  angle: number;
}

export function detectRooms(level: Level, joints?: JointData): DetectedRoom[] {
  const J = joints ?? computeJoints(level);
  const pos = new Map(level.nodes.map((n) => [n.id, n.pos] as const));

  // Ignore dangling walls (a wall with a free end cannot bound a room).
  let walls = level.walls.filter((w) => pos.has(w.a) && pos.has(w.b) && w.a !== w.b);
  for (;;) {
    const deg = new Map<Id, number>();
    for (const w of walls) {
      deg.set(w.a, (deg.get(w.a) ?? 0) + 1);
      deg.set(w.b, (deg.get(w.b) ?? 0) + 1);
    }
    const kept = walls.filter((w) => (deg.get(w.a) ?? 0) > 1 && (deg.get(w.b) ?? 0) > 1);
    if (kept.length === walls.length) break;
    walls = kept;
  }

  const out = new Map<Id, HalfEdge[]>();
  const push = (h: HalfEdge) => {
    if (!out.has(h.from)) out.set(h.from, []);
    out.get(h.from)!.push(h);
  };
  for (const w of walls) {
    const a = pos.get(w.a)!;
    const b = pos.get(w.b)!;
    push({ from: w.a, to: w.b, wallId: w.id, angle: angleOf(sub(b, a)) });
    push({ from: w.b, to: w.a, wallId: w.id, angle: angleOf(sub(a, b)) });
  }
  for (const list of out.values()) list.sort((p, q) => p.angle - q.angle);

  const visited = new Set<HalfEdge>();
  const rooms: DetectedRoom[] = [];

  for (const list of out.values()) {
    for (const start of list) {
      if (visited.has(start)) continue;
      const edges: HalfEdge[] = [];
      let h: HalfEdge | undefined = start;
      let guard = 0;
      while (h && !visited.has(h) && guard++ < 10000) {
        visited.add(h);
        edges.push(h);
        const cur: HalfEdge = h;
        const atTo = out.get(cur.to)!;
        const twinIdx = atTo.findIndex((x) => x.to === cur.from && x.wallId === cur.wallId);
        h = atTo[(twinIdx - 1 + atTo.length) % atTo.length];
      }
      if (edges.length < 3) continue;
      const centre = edges.map((e) => pos.get(e.from)!);
      if (signedArea(centre) <= 0) continue;
      const inner: Vec2[] = [];
      for (const e of edges) {
        const c = J.leftCorner.get(`${e.wallId}|${e.from}`);
        if (!c) continue;
        if (inner.length === 0 || dist(inner[inner.length - 1], c) > 0.5) inner.push(c);
      }
      if (inner.length > 2 && dist(inner[0], inner[inner.length - 1]) <= 0.5) inner.pop();
      const area = inner.length >= 3 ? signedArea(inner) : 0;
      const nodeIds = edges.map((e) => e.from);
      rooms.push({
        key: [...nodeIds].sort().join('|'),
        nodeIds,
        edges: edges.map((e) => ({ wallId: e.wallId, from: e.from, to: e.to })),
        centre,
        inner,
        area: Math.max(0, area),
        label: labelPoint(area > 0 ? inner : centre),
        solid: area < SOLID_AREA_MM2,
      });
    }
  }
  return rooms;
}

function jaccard(a: Id[], b: Id[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function nextRoomName(existing: { name: string }[]): string {
  const used = new Set(existing.map((r) => r.name));
  for (let i = 1; ; i++) {
    const n = `Room ${i}`;
    if (!used.has(n)) return n;
  }
}

/**
 * Bring level.rooms in line with the loops in the wall graph. Names stick
 * to the loop that shares most of its corners, so moving or splitting a
 * wall keeps "Kitchen" called Kitchen.
 */
export function syncRooms(level: Level, detected?: DetectedRoom[]): void {
  const live = (detected ?? detectRooms(level)).filter((r) => !r.solid);
  const pairs: { score: number; li: number; ri: number }[] = [];
  live.forEach((d, li) =>
    level.rooms.forEach((r, ri) => {
      const s = jaccard(d.nodeIds, r.boundary);
      if (s > 0.25) pairs.push({ score: s, li, ri });
    }),
  );
  pairs.sort((p, q) => q.score - p.score);
  const liveTaken = new Map<number, number>();
  const roomTaken = new Set<number>();
  for (const p of pairs) {
    if (liveTaken.has(p.li) || roomTaken.has(p.ri)) continue;
    liveTaken.set(p.li, p.ri);
    roomTaken.add(p.ri);
  }
  const result: Room[] = [];
  live.forEach((d, li) => {
    const ri = liveTaken.get(li);
    if (ri !== undefined) {
      const r = level.rooms[ri];
      const same = r.boundary.length === d.nodeIds.length && r.boundary.every((x, i) => x === d.nodeIds[i]);
      if (!same) r.boundary = d.nodeIds;
      result.push(r);
    } else {
      result.push({ id: uid('r'), name: nextRoomName([...level.rooms, ...result]), boundary: d.nodeIds });
    }
  });
  const unchanged = result.length === level.rooms.length && result.every((r, i) => r === level.rooms[i]);
  if (!unchanged) level.rooms = result;
}

/** Find the detected loop that belongs to a stored room. */
export function matchDetected(room: Room, detected: DetectedRoom[]): DetectedRoom | undefined {
  let best: DetectedRoom | undefined;
  let bestS = 0;
  for (const d of detected) {
    if (d.solid) continue;
    const s = jaccard(d.nodeIds, room.boundary);
    if (s > bestS) {
      bestS = s;
      best = d;
    }
  }
  return best;
}
