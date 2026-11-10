// Read an Apple RoomPlan scan (USDZ, or a bare USDA/USDC file) into flat
// wall, door, window and opening surfaces in plan millimetres.
//
// RoomPlan exports one prim per surface, named Wall0, Door0, Window0,
// Opening0... (often under Arch_grp / Wall_grp / Door_grp groups), each a
// box or plane with its own transform, in metres with Y up. three's
// USDLoader parses both text (USDA) and binary (USDC) USD, inside or
// outside a USDZ archive, and keeps prim names and transforms, so we read
// the geometry back from the scene it builds.
//
// Axes: plan (x, y) = world (x, z) × 1000. That is the same mapping the 3D
// view uses, so a scan is not mirrored.

import * as THREE from 'three';
import { USDLoader } from 'three/examples/jsm/loaders/USDLoader.js';
import type { Vec2 } from '../model/types';

export type SurfaceKind = 'wall' | 'door' | 'window' | 'opening';

export interface ScanSurface {
  kind: SurfaceKind;
  name: string;
  /** Centre of the surface on the floor plan (mm). */
  centre: Vec2;
  /** Unit vector along the surface in plan. */
  dir: Vec2;
  length: number; // mm along the surface
  thickness: number; // mm across it (0 for a flat RoomPlan surface)
  height: number; // mm
  bottom: number; // mm above the scan's floor
}

const NAME = /^(wall|door|window|opening)[_\s-]*\d*$/i;

function kindOf(name: string): SurfaceKind | null {
  const m = name.match(NAME);
  return m ? (m[1].toLowerCase() as SurfaceKind) : null;
}

/** Parse USDZ / USDA / USDC bytes (or USDA text) into a three.js scene. */
export function loadUsd(data: ArrayBuffer | string): THREE.Group {
  const group = new USDLoader().parse(data as ArrayBuffer) as THREE.Group;
  group.updateMatrixWorld(true);
  return group;
}

/** Find every wall, door, window and opening in a parsed RoomPlan scene. */
export function surfacesFromScene(root: THREE.Object3D): ScanSurface[] {
  const out: ScanSurface[] = [];
  const inv = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  const corner = new THREE.Vector3();

  root.traverse((node) => {
    const kind = kindOf(node.name);
    if (!kind) return;
    // The mesh inside "Wall0" is often also called "Wall0": use the outer one.
    let p = node.parent;
    while (p) {
      if (kindOf(p.name)) return;
      p = p.parent;
    }

    // Bounding box of all meshes under this prim, in the prim's own frame.
    inv.copy(node.matrixWorld).invert();
    const box = new THREE.Box3();
    node.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      mesh.geometry.computeBoundingBox();
      const gb = mesh.geometry.boundingBox!;
      m.multiplyMatrices(inv, mesh.matrixWorld);
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? gb.max.x : gb.min.x, i & 2 ? gb.max.y : gb.min.y, i & 4 ? gb.max.z : gb.min.z).applyMatrix4(m);
        box.expandByPoint(corner);
      }
    });
    if (box.isEmpty()) return;

    // Corners in world space.
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 8; i++) {
      pts.push(
        new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(node.matrixWorld),
      );
    }
    // The surface runs along whichever of the prim's horizontal axes is longer.
    const e = node.matrixWorld.elements;
    const axes = [new THREE.Vector2(e[0], e[2]), new THREE.Vector2(e[8], e[10])]
      .filter((a) => a.length() > 1e-6)
      .map((a) => a.normalize());
    if (axes.length === 0) return;
    const extent = (a: THREE.Vector2) => {
      const d = pts.map((q) => q.x * a.x + q.z * a.y);
      return Math.max(...d) - Math.min(...d);
    };
    axes.sort((a, b) => extent(b) - extent(a));
    const along = axes[0];
    const across = new THREE.Vector2(-along.y, along.x);
    const ys = pts.map((q) => q.y);
    const centre = pts.reduce((acc, q) => acc.add(q), new THREE.Vector3()).multiplyScalar(1 / 8);
    out.push({
      kind,
      name: node.name,
      centre: { x: centre.x * 1000, y: centre.z * 1000 },
      dir: { x: along.x, y: along.y },
      length: extent(along) * 1000,
      thickness: extent(across) * 1000,
      height: (Math.max(...ys) - Math.min(...ys)) * 1000,
      bottom: Math.min(...ys) * 1000,
    });
  });

  // Heights above the floor: the lowest wall bottom is the floor.
  const wallBottoms = out.filter((s) => s.kind === 'wall').map((s) => s.bottom);
  const floor = wallBottoms.length ? Math.min(...wallBottoms) : 0;
  for (const s of out) s.bottom -= floor;
  return out;
}

export function readRoomPlan(data: ArrayBuffer | string): ScanSurface[] {
  return surfacesFromScene(loadUsd(data));
}
