import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildLevel } from './sceneBuild';
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
