import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildLevel, freeSpans, SKIRTING_DEPTH, SKIRTING_HEIGHT, wallFaceAt } from './sceneBuild';
import { setWallFace, wallSideRooms } from '../model/faces';
import { buildSeedProject } from '../model/seed';

function avgNormalY(g: THREE.BufferGeometry): number {
  const n = g.getAttribute('normal');
  let s = 0;
  for (let i = 0; i < n.count; i++) s += n.getY(i);
  return s / n.count;
}

describe('3D scene build', () => {
  const project = buildSeedProject();
  const first = project.levels.find((l) => l.name === 'First floor')!;
  const scene = buildLevel(first, project);

  it('floors face up and ceilings face down', () => {
    const floors = scene.meshes.filter((m) => m.key.startsWith('floor:'));
    const ceilings = scene.meshes.filter((m) => m.key.startsWith('ceiling:'));
    expect(floors.length).toBe(2);
    for (const f of floors) expect(avgNormalY(f.geometry)).toBeGreaterThan(0.99);
    for (const c of ceilings) expect(avgNormalY(c.geometry)).toBeLessThan(-0.99);
  });

  it('places floors at the level height and gives each floor its room', () => {
    const f = scene.meshes.find((m) => m.key.startsWith('floor:'))!;
    f.geometry.computeBoundingBox();
    expect(f.geometry.boundingBox!.min.y).toBeCloseTo(first.elevation / 1000, 6);
    expect(f.roomId).toBeTruthy();
  });

  it('merges geometry into a handful of meshes and walls reach ceiling height', () => {
    expect(scene.meshes.length).toBeLessThan(30);
    const walls = scene.meshes.filter((m) => m.key.startsWith('wall:'));
    expect(walls.length).toBeGreaterThan(0);
    const box = new THREE.Box3();
    for (const w of walls) {
      w.geometry.computeBoundingBox();
      box.union(w.geometry.boundingBox!);
    }
    expect(box.max.y).toBeCloseTo((first.elevation + first.ceilingHeight) / 1000, 3);
    expect(box.min.y).toBeCloseTo(first.elevation / 1000, 3);
  });
});

describe('paint, ceiling and woodwork in the 3D build', () => {
  const fresh = () => {
    const project = buildSeedProject();
    return { project, level: project.levels.find((l) => l.name === 'First floor')! };
  };

  it('a face override puts that side of one wall in its own mesh, and clicks find it', () => {
    const { project, level } = fresh();
    const sides = wallSideRooms(level);
    const [wallId, entry] = [...sides.entries()].find(([, e]) => e.L && e.R)!;
    const w = level.walls.find((x) => x.id === wallId)!;
    setWallFace(w, 'L', '#5a2a3a');
    const scene = buildLevel(level, project);
    const painted = scene.meshes.find((m) => m.key === 'wall:#5a2a3a')!;
    expect(painted).toBeTruthy();
    expect(painted.wallFaces!.every((f) => f.wallId === wallId && f.side === 'L')).toBe(true);
    expect(wallFaceAt(painted.wallFaces, 0)).toMatchObject({ wallId, side: 'L' });
    // The other side still wears its room's colour.
    const others = scene.meshes.filter((m) => m.key.startsWith('wall:') && m.key !== 'wall:#5a2a3a');
    expect(others.some((m) => m.wallFaces?.some((f) => f.wallId === wallId && f.side === 'R'))).toBe(true);
    expect(entry.R).toBeTruthy();
  });

  it('ceilings take the room ceiling paint; white by default', () => {
    const { project, level } = fresh();
    const base = buildLevel(level, project).meshes.filter((m) => m.key.startsWith('ceiling:'));
    expect(new Set(base.map((m) => m.material.uuid)).size).toBe(1);
    level.rooms[0].ceilingFinish = 'paint-blush';
    const after = buildLevel(level, project).meshes.filter((m) => m.key.startsWith('ceiling:'));
    expect(new Set(after.map((m) => m.material.uuid)).size).toBe(2);
    const m = after.find((x) => (x.material as THREE.MeshStandardMaterial).color.getHexString() === 'ebd0cc');
    expect(m).toBeTruthy();
  });

  it('woodwork colour makes one shared mesh per colour covering skirting, doors and windows', () => {
    const { project, level } = fresh();
    const plain = buildLevel(level, project);
    expect(plain.meshes.some((m) => m.key.startsWith('wood:'))).toBe(false);
    for (const r of level.rooms) r.woodworkColor = 'paint-aubergine';
    const scene = buildLevel(level, project);
    const wood = scene.meshes.filter((m) => m.key.startsWith('wood:'));
    expect(wood.length).toBe(1);
    expect(wood[0].key).toBe('wood:#5a2a3a');
    expect(scene.meshes.length).toBeLessThan(plain.meshes.length + 4);
  });

  it('skirting is 120 mm high and 18 mm deep, and leaves gaps at openings', () => {
    const { project, level } = fresh();
    for (const r of level.rooms) r.woodworkColor = '#336699';
    const scene = buildLevel(level, project);
    const wood = scene.meshes.find((m) => m.key === 'wood:#336699')!;
    wood.geometry.computeBoundingBox();
    expect(wood.geometry.boundingBox!.min.y).toBeCloseTo(level.elevation / 1000, 3);
    expect(SKIRTING_HEIGHT).toBe(120);
    expect(SKIRTING_DEPTH).toBe(18);
    expect(freeSpans(0, 3000, [[1000, 1900]])).toEqual([
      [0, 1000],
      [1900, 3000],
    ]);
    expect(freeSpans(0, 100, [[0, 90]])).toEqual([]);
  });
});
