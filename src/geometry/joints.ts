// Wall outlines with clean mitred joints, and the length of each wall face.
//
// At each node the walls are sorted by the angle they leave at. The left face
// of one wall meets the right face of the next wall counter-clockwise (maths
// convention), so corners are shared between neighbours and joints close up.

import type { Id, Level, Vec2 } from '../model/types';
import { add, angleOf, dist, dot, lineIntersect, mul, norm, perpL, perpR, sub } from './vec';

export interface WallOutline {
  wallId: Id;
  a: Vec2;
  b: Vec2;
  dir: Vec2; // unit vector a -> b
  length: number; // centreline
  aL: Vec2; // corner at a, on the left of a->b
  aR: Vec2;
  bL: Vec2;
  bR: Vec2;
  poly: Vec2[]; // [aL, bL, bR, aR]
  faceL: number; // length of the left face
  faceR: number;
}

export interface JointData {
  outlines: Map<Id, WallOutline>;
  /** Corner on the left of a wall as it leaves a node. Key: `${wallId}|${nodeId}`. */
  leftCorner: Map<string, Vec2>;
  rightCorner: Map<string, Vec2>;
  /** Filler polygon at junctions of 3+ walls (closes the little triangle gaps). */
  hubs: { nodeId: Id; wallIds: Id[]; poly: Vec2[] }[];
}

interface Spoke {
  wallId: Id;
  dir: Vec2;
  angle: number;
  half: number;
}

const MITRE_LIMIT = 4;

export function computeJoints(level: Level): JointData {
  const pos = new Map(level.nodes.map((n) => [n.id, n.pos] as const));
  const spokes = new Map<Id, Spoke[]>();
  for (const w of level.walls) {
    const a = pos.get(w.a);
    const b = pos.get(w.b);
    if (!a || !b || dist(a, b) < 1e-6) continue;
    const d = norm(sub(b, a));
    const back = mul(d, -1);
    if (!spokes.has(w.a)) spokes.set(w.a, []);
    if (!spokes.has(w.b)) spokes.set(w.b, []);
    spokes.get(w.a)!.push({ wallId: w.id, dir: d, angle: angleOf(d), half: w.thickness / 2 });
    spokes.get(w.b)!.push({ wallId: w.id, dir: back, angle: angleOf(back), half: w.thickness / 2 });
  }

  const leftCorner = new Map<string, Vec2>();
  const rightCorner = new Map<string, Vec2>();
  const hubs: JointData['hubs'] = [];

  for (const [nodeId, list] of spokes) {
    const N = pos.get(nodeId)!;
    list.sort((p, q) => p.angle - q.angle);
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const cur = list[i];
      const next = list[(i + 1) % n];
      const prev = list[(i - 1 + n) % n];
      const ownL = add(N, mul(perpL(cur.dir), cur.half));
      const ownR = add(N, mul(perpR(cur.dir), cur.half));
      let L = ownL;
      let R = ownR;
      if (n > 1) {
        const limit = MITRE_LIMIT * Math.max(cur.half, next.half, prev.half, 1);
        const li = lineIntersect(ownL, cur.dir, add(N, mul(perpR(next.dir), next.half)), next.dir);
        if (li && dist(li, N) <= limit) L = li;
        const ri = lineIntersect(ownR, cur.dir, add(N, mul(perpL(prev.dir), prev.half)), prev.dir);
        if (ri && dist(ri, N) <= limit) R = ri;
      }
      leftCorner.set(`${cur.wallId}|${nodeId}`, L);
      rightCorner.set(`${cur.wallId}|${nodeId}`, R);
    }
    if (n >= 3) {
      const poly: Vec2[] = [];
      for (const sp of list) {
        poly.push(rightCorner.get(`${sp.wallId}|${nodeId}`)!, leftCorner.get(`${sp.wallId}|${nodeId}`)!);
      }
      hubs.push({ nodeId, wallIds: list.map((x) => x.wallId), poly });
    }
  }

  const outlines = new Map<Id, WallOutline>();
  for (const w of level.walls) {
    const a = pos.get(w.a);
    const b = pos.get(w.b);
    if (!a || !b || dist(a, b) < 1e-6) continue;
    const d = norm(sub(b, a));
    const aL = leftCorner.get(`${w.id}|${w.a}`)!;
    const aR = rightCorner.get(`${w.id}|${w.a}`)!;
    // Seen from b the wall leaves in the opposite direction, so sides swap.
    const bR = leftCorner.get(`${w.id}|${w.b}`)!;
    const bL = rightCorner.get(`${w.id}|${w.b}`)!;
    outlines.set(w.id, {
      wallId: w.id,
      a,
      b,
      dir: d,
      length: dist(a, b),
      aL,
      aR,
      bL,
      bR,
      poly: [aL, bL, bR, aR],
      faceL: dot(sub(bL, aL), d),
      faceR: dot(sub(bR, aR), d),
    });
  }
  return { outlines, leftCorner, rightCorner, hubs };
}
