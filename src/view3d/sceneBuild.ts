// Turns one level of the plan into three.js geometry.
//
// Units: plan millimetres become metres. Plan (x, y) maps to world (x, z),
// up is world y, so looking down from above the plan reads the same way as
// in 2D. Geometry is merged per material so a whole floor is a few dozen
// draw calls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Level, Opening, Project, Vec2, Wall } from '../model/types';
import { computeJoints } from '../geometry/joints';
import { detectRooms, type DetectedRoom } from '../geometry/rooms';
import type { WallOutline } from '../geometry/joints';
import { roomForLoop, wallSideRooms, type WallSides } from '../model/faces';
import { add, dot, mul, perpL, perpR, signedArea, sub } from '../geometry/vec';
import { findCatalogueItem, itemParts, localToPlan } from '../catalogue/catalogue';
import { wallDir, wallEndExtensions, wallProfile, type WallProfile } from './wallProfile';
import { ceilingMaterialFor, finishMaterial, tintedMaterial, tokenMaterial, woodworkMaterial } from './materials';
import { overrideColor } from '../catalogue/colors';
import { defaultFloorId, wallFaceFinishId, woodworkHex } from './finishes';

export const MM = 0.001;

/** Skirting: 120 mm high, 18 mm deep, along each wall face inside a room. */
export const SKIRTING_HEIGHT = 120;
export const SKIRTING_DEPTH = 18;

/** Wall height in the overview's cut-away view (mm). */
export const CUTAWAY_HEIGHT = 1200;

export interface BuildOptions {
  /** Cut walls (and what is in them) at this height above the floor. */
  cutHeight?: number;
}

export interface MeshSpec {
  key: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  /** Set on floors so a click can pick the room. */
  roomId?: string;
  /** Set on wall meshes: which wall face each run of triangles belongs to, so a click can pick it. */
  wallFaces?: FaceRange[];
}

/** Triangles [from, to) of a merged wall mesh that are one face of one wall. */
export interface FaceRange {
  from: number;
  to: number;
  wallId: string;
  side: 'L' | 'R';
}

/** Which wall face a click on triangle `faceIndex` of a wall mesh hit. */
export function wallFaceAt(ranges: FaceRange[] | undefined, faceIndex: number | undefined): FaceRange | undefined {
  if (!ranges || faceIndex === undefined) return undefined;
  return ranges.find((r) => faceIndex >= r.from && faceIndex < r.to);
}

const faceTags = new WeakMap<THREE.BufferGeometry, { wallId: string; side: 'L' | 'R' }>();

export interface LevelScene {
  meshes: MeshSpec[];
  /** Ceiling light positions (world metres), one per room. */
  lights: THREE.Vector3[];
  dispose: () => void;
}

/** Matrix taking wall-frame coordinates (u along wall, v up, n across) in metres to world. */
function wallBasis(a: Vec2, d: Vec2, elevation: number): THREE.Matrix4 {
  const n = perpL(d);
  return new THREE.Matrix4().set(
    d.x, 0, n.x, a.x * MM,
    0, 1, 0, elevation * MM,
    d.y, 0, n.y, a.y * MM,
    0, 0, 0, 1,
  );
}

/** A box given by ranges in the wall frame (millimetres). */
function wallBox(basis: THREE.Matrix4, u0: number, u1: number, v0: number, v1: number, n0: number, n1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry((u1 - u0) * MM, (v1 - v0) * MM, (n1 - n0) * MM);
  g.translate(((u0 + u1) / 2) * MM, ((v0 + v1) / 2) * MM, ((n0 + n1) / 2) * MM);
  g.applyMatrix4(basis);
  return g;
}

/** Flat polygon at a height with UVs in metres. Normal up or down. */
function flatPolygon(poly: Vec2[], heightMm: number, up: boolean): THREE.BufferGeometry | null {
  if (poly.length < 3) return null;
  const pts = signedArea(poly) < 0 ? [...poly].reverse() : poly;
  const tris = THREE.ShapeUtils.triangulateShape(
    pts.map((p) => new THREE.Vector2(p.x, p.y)),
    [],
  );
  const pos: number[] = [];
  const uv: number[] = [];
  for (const p of pts) {
    pos.push(p.x * MM, heightMm * MM, p.y * MM);
    uv.push(p.x * MM, p.y * MM);
  }
  const idx: number[] = [];
  for (const [i, j, k] of tris) {
    // Normal's y component for (i, j, k) in world (x, z): -(cross in plan).
    const ci = pts[i];
    const cj = pts[j];
    const ck = pts[k];
    const planCross = (cj.x - ci.x) * (ck.y - ci.y) - (cj.y - ci.y) * (ck.x - ci.x);
    const facesUp = planCross < 0;
    if (facesUp === up) idx.push(i, j, k);
    else idx.push(i, k, j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Wall profile as three.js shapes (metres). In the cut-away view, an opening
 * that reaches the cut splits the wall into separate pieces, so no thin strip
 * is left across the top of it.
 */
function profileShapes(profile: WallProfile, cut: boolean): { shapes: THREE.Shape[]; sills: { u0: number; u1: number; v1: number }[] } {
  const { u0, u1, v0, v1 } = profile.outer;
  const through = cut ? profile.holes.filter((h) => h.v1 >= v1 - 25).sort((p, q) => p.u0 - q.u0) : [];
  const spans: [number, number][] = [];
  let cursor = u0;
  for (const h of through) {
    if (h.u0 > cursor + 1) spans.push([cursor, h.u0]);
    cursor = Math.max(cursor, h.u1);
  }
  if (u1 > cursor + 1) spans.push([cursor, u1]);
  // Windows that reach the cut still have wall below the sill.
  const sills = through.filter((h) => h.v0 > 1).map((h) => ({ u0: h.u0, u1: h.u1, v1: h.v0 }));
  const shapes = spans.map(([a, b]) => {
    const shape = new THREE.Shape();
    shape.moveTo(a * MM, v0 * MM);
    shape.lineTo(b * MM, v0 * MM);
    shape.lineTo(b * MM, v1 * MM);
    shape.lineTo(a * MM, v1 * MM);
    shape.closePath();
    for (const h of profile.holes) {
      if (through.includes(h) || h.u0 < a + 1 || h.u1 > b - 1) continue;
      const path = new THREE.Path();
      path.moveTo(h.u0 * MM, h.v0 * MM);
      path.lineTo(h.u0 * MM, h.v1 * MM);
      path.lineTo(h.u1 * MM, h.v1 * MM);
      path.lineTo(h.u1 * MM, h.v0 * MM);
      path.closePath();
      shape.holes.push(path);
    }
    return shape;
  });
  return { shapes, sills };
}

/** The door leaf, placed exactly as the 2D plan draws its swing. */
function doorLeaf(o: Opening, a: Vec2, d: Vec2, half: number, elevation: number): THREE.BufferGeometry {
  const sw = o.swing ?? { hinge: 'start', side: 'left', angle: 90 };
  const sideN = sw.side === 'left' ? perpL(d) : perpR(d);
  const n = perpL(d);
  const sign = sw.side === 'left' ? 1 : -1;
  const s = o.offset;
  const e = o.offset + o.width;
  const at = (along: number, across: number) => add(add(a, mul(d, along)), mul(n, across));
  const H = at(sw.hinge === 'start' ? s : e, sign * half);
  const J = at(sw.hinge === 'start' ? e : s, sign * half);
  const a0 = Math.atan2(J.y - H.y, J.x - H.x);
  const a1 = Math.atan2(sideN.y, sideN.x);
  let da = a1 - a0;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  const ang = a0 + da * Math.min(1, (sw.angle ?? 90) / 90);
  const len = o.width - 20;
  const g = new THREE.BoxGeometry(len * MM, (o.height - 10) * MM, 0.04);
  g.translate((len / 2) * MM, ((o.height - 10) / 2) * MM, 0);
  // Box +x along plan direction (cos ang, sin ang): world rotation y = -ang.
  g.rotateY(-ang);
  g.translate(H.x * MM, elevation * MM, H.y * MM);
  return g;
}

/** Intervals [s, e] of [u0, u1] left after removing the blocked ones. */
export function freeSpans(u0: number, u1: number, blocked: [number, number][]): [number, number][] {
  const spans: [number, number][] = [];
  let cursor = u0;
  for (const [s, e] of [...blocked].sort((p, q) => p[0] - q[0])) {
    if (s > cursor) spans.push([cursor, Math.min(s, u1)]);
    cursor = Math.max(cursor, e);
    if (cursor >= u1) break;
  }
  if (cursor < u1) spans.push([cursor, u1]);
  return spans.filter(([s, e]) => e - s > 20);
}

function wallMeshes(
  level: Level,
  wall: Wall,
  outline: WallOutline | undefined,
  height: number,
  sideRooms: WallSides,
  out: Map<string, THREE.BufferGeometry[]>,
  cut = false,
) {
  const { a, d, length } = wallDir(level, wall);
  if (length < 1) return;
  const { extA, extB } = wallEndExtensions(level, wall);
  const profile = wallProfile(length, height, wall.openings, extA, extB);
  const basis = wallBasis(a, d, level.elevation);
  const { shapes, sills } = profileShapes(profile, cut);
  const half = wall.thickness / 2;
  // Two half-thickness slabs, so each side wears its own room's finish.
  for (const side of ['L', 'R'] as const) {
    const g = new THREE.ExtrudeGeometry(shapes, { depth: half * MM, bevelEnabled: false, curveSegments: 1 });
    if (side === 'R') g.translate(0, 0, -half * MM);
    g.applyMatrix4(basis);
    const key = `wall:${wallFaceFinishId(sideRooms[side]?.room, wall, side)}`;
    const tag = { wallId: wall.id, side };
    push(out, key, g, tag);
    for (const sl of sills) push(out, key, side === 'L' ? wallBox(basis, sl.u0, sl.u1, 0, sl.v1, 0, half) : wallBox(basis, sl.u0, sl.u1, 0, sl.v1, -half, 0), tag);
  }
  // Woodwork takes the colour of the room on the wall's left, else on its right.
  const woodOf = (hex: string | undefined) => (hex ? `wood:${hex}` : 'token:frame');
  const openingWood = woodOf(woodworkHex(sideRooms.L?.room) ?? woodworkHex(sideRooms.R?.room));
  // Skirting along each face that looks into a room, skipping openings that reach the floor.
  if (outline) {
    const skirtH = Math.min(SKIRTING_HEIGHT, height);
    const gaps: [number, number][] = wall.openings.filter((o) => o.sill < SKIRTING_HEIGHT).map((o) => [o.offset, o.offset + o.width]);
    for (const side of ['L', 'R'] as const) {
      if (!sideRooms[side]) continue;
      const u0 = dot(sub(side === 'L' ? outline.aL : outline.aR, a), d);
      const u1 = dot(sub(side === 'L' ? outline.bL : outline.bR, a), d);
      const key = woodOf(woodworkHex(sideRooms[side]?.room));
      for (const [s, e] of freeSpans(Math.min(u0, u1), Math.max(u0, u1), gaps)) {
        push(out, key, side === 'L' ? wallBox(basis, s, e, 0, skirtH, half, half + SKIRTING_DEPTH) : wallBox(basis, s, e, 0, skirtH, -half - SKIRTING_DEPTH, -half));
      }
    }
  }
  // Openings
  for (const o of wall.openings) {
    const hole = profile.holes.find((h) => h.openingId === o.id);
    if (!hole) continue;
    if (cut) {
      // Cut-away: glass only where the window is below the cut; no leaves or frames.
      if ((o.type === 'window' || o.type === 'bayWindow') && hole.v1 > hole.v0) push(out, 'token:glass', wallBox(basis, hole.u0, hole.u1, hole.v0, hole.v1, -6, 6));
      continue;
    }
    if (o.type === 'window' || o.type === 'bayWindow') {
      push(out, 'token:glass', wallBox(basis, hole.u0, hole.u1, hole.v0, hole.v1, -6, 6));
      const f = 45;
      const depth = Math.min(70, half * 2);
      push(out, openingWood, wallBox(basis, hole.u0, hole.u1, hole.v0, hole.v0 + f, -depth / 2, depth / 2));
      push(out, openingWood, wallBox(basis, hole.u0, hole.u1, hole.v1 - f, hole.v1, -depth / 2, depth / 2));
      push(out, openingWood, wallBox(basis, hole.u0, hole.u0 + f, hole.v0, hole.v1, -depth / 2, depth / 2));
      push(out, openingWood, wallBox(basis, hole.u1 - f, hole.u1, hole.v0, hole.v1, -depth / 2, depth / 2));
      const mid = (hole.v0 + hole.v1) / 2;
      push(out, openingWood, wallBox(basis, hole.u0, hole.u1, mid - 20, mid + 20, -depth / 2, depth / 2));
    } else if (o.type === 'door') {
      const leafWood = woodworkHex(sideRooms.L?.room) ?? woodworkHex(sideRooms.R?.room);
      push(out, leafWood ? openingWood : 'token:door', doorLeaf(o, a, d, half, level.elevation));
      // Frame: a 50 mm architrave round the opening on both faces of the wall.
      const w = 50;
      const t = 12;
      for (const [n0, n1] of [
        [half, half + t],
        [-half - t, -half],
      ]) {
        push(out, openingWood, wallBox(basis, hole.u0 - w, hole.u0, 0, hole.v1 + w, n0, n1));
        push(out, openingWood, wallBox(basis, hole.u1, hole.u1 + w, 0, hole.v1 + w, n0, n1));
        push(out, openingWood, wallBox(basis, hole.u0, hole.u1, hole.v1, hole.v1 + w, n0, n1));
      }
    }
  }
}

function push(map: Map<string, THREE.BufferGeometry[]>, key: string, g: THREE.BufferGeometry, tag?: { wallId: string; side: 'L' | 'R' }) {
  if (tag) faceTags.set(g, tag);
  const list = map.get(key);
  if (list) list.push(g);
  else map.set(key, [g]);
}

/** Stepped boxes along a stair, rising (or falling) between two floor heights. */
function stairGeometry(level: Level, s: Level['stairs'][number], to: number): THREE.BufferGeometry[] {
  const from = level.elevation;
  const rise = Math.abs(to - from);
  const n = Math.max(2, Math.round(rise / 190));
  const going = s.length / n;
  const out: THREE.BufferGeometry[] = [];
  const base = Math.min(from, to);
  for (let i = 0; i < n; i++) {
    const t0 = from + ((to - from) * i) / n;
    const t1 = from + ((to - from) * (i + 1)) / n;
    const top = Math.max(t0, t1);
    const hgt = Math.max(30, top - base);
    const g = new THREE.BoxGeometry(going * MM, hgt * MM, s.width * MM);
    const cx = -s.length / 2 + going * (i + 0.5);
    g.translate(cx * MM, (base + hgt / 2) * MM, 0);
    g.rotateY((-s.rotationDeg * Math.PI) / 180);
    g.translate(s.pos.x * MM, 0, s.pos.y * MM);
    out.push(g);
  }
  return out;
}

export function buildLevel(level: Level, project: Project, opts: BuildOptions = {}): LevelScene {
  const cut = opts.cutHeight;
  const joints = computeJoints(level);
  const detected = detectRooms(level, joints);
  const groups = new Map<string, THREE.BufferGeometry[]>();
  const meshes: MeshSpec[] = [];
  const lights: THREE.Vector3[] = [];

  // Which room is on each side of each wall.
  const sides = wallSideRooms(level, detected);

  for (const w of level.walls) {
    const full = w.height ?? level.ceilingHeight;
    wallMeshes(level, w, joints.outlines.get(w.id), cut ? Math.min(full, cut) : full, sides.get(w.id) ?? {}, groups, !!cut);
  }

  for (const r of detected) {
    if (r.solid) {
      // Chimney breast voids and the like: solid masonry to ceiling height.
      const pts = r.centre;
      const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x * MM, -p.y * MM)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: (cut ? Math.min(cut, level.ceilingHeight) : level.ceilingHeight) * MM, bevelEnabled: false });
      // shape (x, -y) -> world (x, z = y); extrusion -> up.
      g.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, level.elevation * MM, 0, -1, 0, 0, 0, 0, 0, 1));
      push(groups, 'token:masonry', g);
      continue;
    }
    const room = roomForLoop(level, r);
    const floor = flatPolygon(r.inner, level.elevation, true);
    if (floor) {
      const fid = room?.floorFinish ?? defaultFloorId(room?.name ?? '');
      meshes.push({
        key: `floor:${room?.id ?? r.key}`,
        geometry: floor,
        material: finishMaterial(fid, 'floor-pale-oak'),
        castShadow: false,
        receiveShadow: true,
        roomId: room?.id,
      });
    }
    const ch = room?.ceilingHeight ?? level.ceilingHeight;
    const ceil = cut ? null : flatPolygon(r.inner, level.elevation + ch, false);
    if (ceil) meshes.push({ key: `ceiling:${r.key}`, geometry: ceil, material: ceilingMaterialFor(room?.ceilingFinish), castShadow: false, receiveShadow: false });
    lights.push(new THREE.Vector3(r.label.x * MM, (level.elevation + ch - 300) * MM, r.label.y * MM));
  }

  const byId = new Map(project.levels.map((l) => [l.id, l] as const));
  for (const s of level.stairs) {
    const target = byId.get(s.toLevelId);
    if (!target) continue;
    for (const g of stairGeometry(level, s, target.elevation)) push(groups, 'token:stair', g);
  }

  for (const it of level.items) {
    const cat = findCatalogueItem(project, it.catalogueId);
    if (!cat) continue;
    const rot = (-it.rotationDeg * Math.PI) / 180;
    for (const p of itemParts(it, cat)) {
      const g =
        p.shape === 'cylinder'
          ? new THREE.CylinderGeometry((p.size[0] / 2) * MM, (p.size[0] / 2) * MM, p.size[1] * MM, 20)
          : new THREE.BoxGeometry(p.size[0] * MM, p.size[1] * MM, p.size[2] * MM);
      g.rotateY(rot);
      const c = localToPlan(it, cat, p.pos[0], p.pos[2]);
      g.translate(c.x * MM, (level.elevation + p.pos[1]) * MM, c.y * MM);
      const tinted = overrideColor(p.colorToken, it.finish, cat.tint);
      push(groups, tinted ? `tint:${p.colorToken}|${tinted}` : `token:${p.colorToken}`, g.index ? g.toNonIndexed() : g);
    }
  }

  for (const [key, list] of groups) {
    // Triangle runs that belong to a wall face, in merge order (for click picking).
    const wallFaces: FaceRange[] = [];
    let tri = 0;
    const nonIndexed = list.map((g) => {
      const ni = g.index ? g.toNonIndexed() : g;
      // Merge needs the same attribute set everywhere.
      if (!ni.getAttribute('uv')) ni.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((ni.getAttribute('position').count) * 2), 2));
      for (const name of Object.keys(ni.attributes)) if (!['position', 'normal', 'uv'].includes(name)) ni.deleteAttribute(name);
      ni.clearGroups();
      const count = ni.getAttribute('position').count / 3;
      const tag = faceTags.get(g);
      if (tag) wallFaces.push({ from: tri, to: tri + count, ...tag });
      tri += count;
      return ni;
    });
    const merged = mergeGeometries(nonIndexed, false);
    for (const g of list) g.dispose();
    for (const g of nonIndexed) g.dispose();
    if (!merged) continue;
    const [kind, id] = key.split(':');
    const material =
      kind === 'wall'
        ? finishMaterial(id, 'wall-white')
        : kind === 'tint'
          ? tintedMaterial(id.split('|')[0], id.split('|')[1])
          : kind === 'wood'
            ? woodworkMaterial(id)
            : tokenMaterial(id);
    const glassy = id === 'glass' || id === 'water';
    meshes.push({ key, geometry: merged, material, castShadow: !glassy, receiveShadow: !glassy, wallFaces: wallFaces.length ? wallFaces : undefined });
  }

  return {
    meshes,
    lights,
    dispose: () => meshes.forEach((m) => m.geometry.dispose()),
  };
}

/** Plan bounds of a level in millimetres (walls and items), for framing the camera. */
export function levelBoundsMm(level: Level): { min: Vec2; max: Vec2 } | null {
  const pts = level.nodes.map((n) => n.pos);
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } };
}

/** The biggest room on a level: where Walk starts. */
export function biggestRoom(level: Level): DetectedRoom | undefined {
  return detectRooms(level)
    .filter((r) => !r.solid)
    .sort((p, q) => q.area - p.area)[0];
}
