// A damaged plan must open (minus the damaged bits) and never crash the
// geometry, the rules or the 3D builder afterwards.

import { describe, expect, it } from 'vitest';
import type { Level, Project } from './types';
import { repairProject } from './repair';
import { buildSeedProject } from './seed';
import { computeJoints } from '../geometry/joints';
import { detectRooms } from '../geometry/rooms';
import { wallDimensions } from '../geometry/dimensions';
import { runRules } from '../rules/engine';
import { buildLevel } from '../view3d/sceneBuild';
import { levelObstacles, stairRamps } from '../view3d/walkPhysics';
import { activeLevelsResolved } from './schemes';
import { parseHistory } from './versions';
import { findNonFinite, rng, stressProject } from '../test/fuzzHelpers';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('repairProject', () => {
  it('leaves a healthy plan exactly as it was', () => {
    for (const p of [buildSeedProject(), stressProject()]) {
      const copy = clone(p);
      const r = repairProject(clone(p));
      expect(r.repairs).toEqual([]);
      expect(r.project).toEqual(copy);
    }
  });

  it('drops a wall that points at a missing corner, and says so', () => {
    const p = clone(buildSeedProject());
    const L = p.levels[1];
    const n = L.walls.length;
    L.walls[0].b = 'gone';
    const r = repairProject(p);
    expect(r.project.levels[1].walls).toHaveLength(n - 1);
    expect(r.repairs.join()).toMatch(/walls with a missing corner/);
  });

  it('drops a wall that starts and ends at the same corner', () => {
    const p = clone(buildSeedProject());
    const w = p.levels[1].walls[0];
    w.b = w.a;
    repairProject(p);
    expect(p.levels[1].walls.find((x) => x.id === w.id)).toBeUndefined();
  });

  it('turns NaN (stored as null) into something safe instead of keeping it', () => {
    const p = clone(buildSeedProject());
    const L = p.levels[1];
    (L.nodes[0].pos as unknown as { x: unknown }).x = null;
    (L.walls[1] as unknown as { thickness: unknown }).thickness = null;
    L.items.push({ id: 'i1', catalogueId: 'sofa-2', pos: { x: 100, y: 100 }, rotationDeg: null as unknown as number, dims: { w: NaN, d: 900, h: 800 } });
    const r = repairProject(p);
    const out = r.project.levels[1];
    expect(out.nodes.find((n) => n.id === L.nodes[0]?.id && !Number.isFinite(n.pos.x))).toBeUndefined();
    expect(findNonFinite(out)).toBeNull();
    const item = out.items.find((i) => i.id === 'i1')!;
    expect(item.rotationDeg).toBe(0);
    expect(item.dims.w).toBeGreaterThan(0);
  });

  it('removes a group member that no longer exists and dissolves a group left with one', () => {
    const p = clone(buildSeedProject());
    const L = p.levels[1];
    L.items.push(
      { id: 'a', catalogueId: 'sofa-2', pos: { x: 0, y: 0 }, rotationDeg: 0, dims: { w: 1800, d: 900, h: 800 } },
      { id: 'b', catalogueId: 'sofa-2', pos: { x: 0, y: 0 }, rotationDeg: 0, dims: { w: 1800, d: 900, h: 800 } },
    );
    L.groups = [
      { id: 'g1', name: 'Pair', itemIds: ['a', 'b'] },
      { id: 'g2', name: 'Lonely', itemIds: ['a', 'ghost'] },
    ];
    const r = repairProject(p);
    expect(r.project.levels[1].groups).toEqual([{ id: 'g1', name: 'Pair', itemIds: ['a', 'b'] }]);
  });

  it('keeps a stair whose destination floor is gone, and bounds its size', () => {
    const p = clone(buildSeedProject());
    const L = p.levels[0];
    L.stairs.push({ id: 's9', pos: { x: 0, y: 0 }, rotationDeg: 0, width: 900, length: 1e12, toLevelId: 'deleted-floor', direction: 'up' });
    const r = repairProject(p);
    const s = r.project.levels[0].stairs.find((x) => x.id === 's9')!;
    expect(s.length).toBeLessThanOrEqual(20000);
    expect(s.toLevelId).toBe('deleted-floor');
  });

  it('removes notes and pins with no position', () => {
    const p = clone(buildSeedProject());
    const L = p.levels[0];
    L.notes = [
      { id: 'n1', kind: 'note', pos: { x: 1, y: 2 } },
      { id: 'n2', kind: 'note', pos: null as unknown as { x: number; y: number } },
      { id: 'n3', kind: 'measure', pos: { x: 1, y: 2 }, to: { x: NaN, y: 3 } },
    ];
    L.markers = [{ id: 'm1', pos: { x: 1, y: 2 }, text: 'ok' }, { id: 'm2', text: 'no pos' } as unknown as Level['markers'] extends (infer M)[] | undefined ? M : never];
    const r = repairProject(p);
    expect(r.project.levels[0].notes?.map((n) => n.id)).toEqual(['n1', 'n3']);
    expect(r.project.levels[0].notes?.[1].to).toBeUndefined();
    expect(r.project.levels[0].markers?.map((m) => m.id)).toEqual(['m1']);
  });

  it('drops a room whose corners are gone (rooms are found again from the walls)', () => {
    const p = clone(buildSeedProject());
    p.levels[1].rooms[0].boundary = ['x', 'y', 'z'];
    const n = p.levels[1].rooms.length;
    const r = repairProject(p);
    expect(r.project.levels[1].rooms).toHaveLength(n - 1);
  });

  it('gives a duplicated floor id a new one and fixes the choice of option that pointed at a missing floor', () => {
    const p = clone(buildSeedProject());
    p.levels[1].id = p.levels[0].id;
    p.activeSchemes = { g: 'nope' };
    const r = repairProject(p);
    expect(new Set(r.project.levels.map((l) => l.id)).size).toBe(r.project.levels.length);
    expect(r.project.activeSchemes).toEqual({});
  });

  it('drops a plan picture with no usable scale', () => {
    const p = clone(buildSeedProject());
    p.levels[0].underlay = { imageDataUrl: 'data:,', scaleMmPerPx: 0, offset: { x: 0, y: 0 }, rotationDeg: 0, opacity: 1, locked: true };
    const r = repairProject(p);
    expect(r.project.levels[0].underlay).toBeUndefined();
  });
});

/* ---- random damage ---------------------------------------------------- */

type Container = Record<string, unknown> | unknown[];

function paths(root: unknown): { parent: Container; key: string | number }[] {
  const out: { parent: Container; key: string | number }[] = [];
  const walk = (x: unknown) => {
    if (!x || typeof x !== 'object') return;
    const c = x as Container;
    for (const k of Array.isArray(c) ? c.keys() : Object.keys(c)) {
      const v = (c as Record<string | number, unknown>)[k];
      // Skip the underlay pictures: very long strings, and damaging them tells us nothing.
      if (typeof v === 'string' && v.length > 1000) continue;
      out.push({ parent: c, key: k });
      walk(v);
    }
  };
  walk(root);
  return out;
}

const DAMAGE = [undefined, null, 'x', 1e30, -5, 0, [], {}, NaN];

function damage(p: Project, rand: () => number, count: number): void {
  // Never touch the top-level version or the list of floors itself.
  const all = paths(p).filter((q) => !(q.parent === (p as unknown as Container) && (q.key === 'version' || q.key === 'levels')));
  for (let i = 0; i < count; i++) {
    const target = all[Math.floor(rand() * all.length)];
    const { parent, key } = target;
    if (Array.isArray(parent) && rand() < 0.3) {
      parent.splice(key as number, 1);
    } else if (!Array.isArray(parent) && rand() < 0.2) {
      delete parent[key as string];
    } else {
      (parent as Record<string | number, unknown>)[key] = DAMAGE[Math.floor(rand() * DAMAGE.length)];
    }
  }
}

describe('a randomly damaged plan', () => {
  const base = JSON.stringify(stressProject(60, 10));
  for (let seed = 1; seed <= 60; seed++) {
    it(`opens and draws without crashing (seed ${seed})`, () => {
      const rand = rng(seed * 101);
      const raw = JSON.parse(base) as Project;
      damage(raw, rand, 1 + Math.floor(rand() * 25));
      let project: Project;
      try {
        project = repairProject(raw).project;
      } catch (e) {
        // The only acceptable refusals are the plain-language ones.
        expect((e as Error).message).toMatch(/Flat Planner|no floors|version/);
        return;
      }
      expect(Array.isArray(project.levels) && project.levels.length > 0).toBe(true);
      for (const L of activeLevelsResolved(project)) {
        const J = computeJoints(L);
        const rooms = detectRooms(L, J);
        const dims = wallDimensions(L, J, rooms);
        const issues = runRules(L, project);
        const obstacles = levelObstacles(L, project);
        const scene = buildLevel(L, project);
        expect(findNonFinite([J, rooms, dims, issues, obstacles]), `${L.name}`).toBeNull();
        expect(scene.meshes.length).toBeGreaterThanOrEqual(0);
      }
      stairRamps(project.levels);
    });
  }
});

describe('version history from a file', () => {
  it('drops a version whose plan is unusable and repairs the others', () => {
    const good = clone(buildSeedProject());
    good.levels[0].walls[0].a = 'gone';
    const n = good.levels[0].walls.length;
    const h = parseHistory({
      format: 1,
      versions: [
        { id: 'v1', name: 'Good', createdAt: '2026-01-01T00:00:00Z', kind: 'named', project: good },
        { id: 'v2', name: 'Bad', createdAt: '2026-01-01T00:00:00Z', kind: 'named', project: { version: 1, levels: 'nonsense' } },
      ],
      images: {},
    });
    expect(h?.versions.map((v) => v.id)).toEqual(['v1']);
    expect(h?.versions[0].project.levels[0].walls).toHaveLength(n - 1);
  });
});
