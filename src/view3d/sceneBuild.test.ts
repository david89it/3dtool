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

  describe('sloped ceilings in the seed loft', () => {
    const loftScene = () => {
      const p = buildSeedProject();
      const loft = p.levels.find((l) => l.name === 'Loft')!;
      return { p, loft, scene: buildLevel(loft, p) };
    };

    it('builds a flat ceiling part and one tilted plane per slope, all facing down', () => {
      const { scene } = loftScene();
      const ceil = scene.meshes.filter((m) => m.key.startsWith('ceiling:'));
      expect(ceil.filter((m) => m.key.includes(':slope'))).toHaveLength(2);
      expect(ceil.length).toBe(3);
      for (const c of ceil) expect(avgNormalY(c.geometry)).toBeLessThan(0);
      // The tilted planes start at the knee height and end at the 2.2 m flat ceiling.
      const heights = ceil
        .filter((m) => m.key.includes(':slope'))
        .map((m) => {
          m.geometry.computeBoundingBox();
          return [m.geometry.boundingBox!.min.y, m.geometry.boundingBox!.max.y];
        });
      for (const [lo, hi] of heights) {
        expect(lo).toBeGreaterThan(8.8 + 0.85);
        expect(lo).toBeLessThan(8.8 + 0.95);
        expect(hi).toBeCloseTo(8.8 + 2.2, 2);
      }
    });

    it('cuts the end walls to the slope line: lower at the knee walls than at the middle', () => {
      const { scene, loft } = loftScene();
      const wall = scene.meshes.find((m) => m.key.startsWith('wall:') && m.wallFaces)!;
      const pos = wall.geometry.getAttribute('position');
      let nearBack = 0;
      let mid = 0;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const y = pos.getY(i) - loft.elevation / 1000;
        if (Math.abs(x) < 0.2 || Math.abs(x - 4.52) < 0.2) {
          if (z < -0.1) nearBack = Math.max(nearBack, y);
          if (z > 1.5 && z < 5.3) mid = Math.max(mid, y);
        }
      }
      expect(nearBack).toBeLessThan(1.0);
      expect(mid).toBeCloseTo(2.2, 2);
    });

    it('still builds with a window under the slope, a one-slope room and the cut-away view', () => {
      const { p, loft } = loftScene();
      const y = (id: string) => loft.nodes.find((n) => n.id === id)!.pos.y;
      const front = loft.walls.find((w) => y(w.a) === 7065 && y(w.b) === 7065)!;
      front.openings.push({ id: 'ow', type: 'window', offset: 1500, width: 1000, height: 1500, sill: 800 }); // reaches above the 900 mm knee
      loft.rooms[0].slopes!.pop();
      expect(() => buildLevel(loft, p)).not.toThrow();
      expect(() => buildLevel(loft, p, { cutHeight: 1200 })).not.toThrow();
    });
  });
});
