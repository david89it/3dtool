// Random edits on a wall graph: nothing may throw, and every number that comes
// out of the geometry and the rules must be finite.

import { describe, expect, it } from 'vitest';
import type { Level } from '../model/types';
import { addWall, clampOpenings, defaultWallProps, deleteWall, mergeNodes, settleNode, splitWall, setNodePos } from './wallGraph';
import { computeJoints } from './joints';
import { detectRooms, syncRooms } from './rooms';
import { wallDimensions, measureWallFace } from './dimensions';
import { addOpening, deleteOpening, openUpWall } from './openingEdits';
import { runRules } from '../rules/engine';
import { CATALOGUE } from '../catalogue/items';
import { newPlacedItem } from '../catalogue/catalogue';
import { findNonFinite, rng } from '../test/fuzzHelpers';
import { pruneGroups } from '../model/groups';

function emptyLevel(): Level {
  return { id: 'L', name: 'L', elevation: 0, ceilingHeight: 2400, nodes: [], walls: [], rooms: [], items: [], stairs: [], markers: [] };
}

function check(level: Level, label: string): void {
  // runRules and the geometry cache key on object identity (immer gives a new object per edit),
  // so test a fresh copy each time.
  const fresh: Level = structuredClone(level);
  const t: Record<string, number> = {};
  const time = <T,>(k: string, f: () => T): T => {
    const t0 = performance.now();
    const r = f();
    t[k] = performance.now() - t0;
    return r;
  };
  const J = time('joints', () => computeJoints(fresh));
  const rooms = time('rooms', () => detectRooms(fresh, J));
  const dims = time('dims', () => wallDimensions(fresh, J, rooms));
  syncRooms(level, detectRooms(level));
  const issues = time('rules', () => runRules(fresh, { catalogueOverrides: [] }));
  for (const [k, ms] of Object.entries(t)) if (ms > 100) console.log(label, k, Math.round(ms), 'ms', fresh.walls.length, 'walls', fresh.items.length, 'items');
  for (const [what, v] of [['joints', J], ['rooms', rooms], ['dims', dims], ['issues', issues]] as const) {
    const bad = findNonFinite(v);
    expect(bad, `${label}: ${what} has ${bad}`).toBeNull();
  }
  // Every room refers to nodes that exist and has at least three corners.
  const ids = new Set(level.nodes.map((n) => n.id));
  for (const r of level.rooms) {
    expect(r.boundary.length).toBeGreaterThanOrEqual(3);
    for (const n of r.boundary) expect(ids.has(n), `${label}: room ${r.name} uses missing node`).toBe(true);
  }
  for (const w of level.walls) {
    expect(ids.has(w.a) && ids.has(w.b), `${label}: wall with missing node`).toBe(true);
    expect(w.a).not.toBe(w.b);
  }
}

describe('fuzz: wall graph edits', () => {
  for (let seed = 1; seed <= 40; seed++) {
    it(`seed ${seed}`, () => {
      const rand = rng(seed);
      const L = emptyLevel();
      // A coarse grid makes crossings, shared nodes, duplicates and zero-length walls common.
      const pt = () => ({ x: Math.round(rand() * 6) * 500, y: Math.round(rand() * 6) * 500 });
      for (let step = 0; step < 40; step++) {
        const op = rand();
        const props = defaultWallProps(rand() < 0.3 ? 'external' : 'internal');
        if (op < 0.5 || L.walls.length === 0) {
          // sometimes a repeat of the same point (zero length) or a tiny nudge
          const a = pt();
          const b = rand() < 0.1 ? a : rand() < 0.1 ? { x: a.x + 0.4, y: a.y } : pt();
          addWall(L, a, b, props);
        } else if (op < 0.6) {
          const w = L.walls[Math.floor(rand() * L.walls.length)];
          splitWall(L, w.id, { x: rand() * 3000, y: rand() * 3000 });
        } else if (op < 0.7) {
          deleteWall(L, L.walls[Math.floor(rand() * L.walls.length)].id);
        } else if (op < 0.78 && L.nodes.length > 1) {
          const a = L.nodes[Math.floor(rand() * L.nodes.length)];
          const b = L.nodes[Math.floor(rand() * L.nodes.length)];
          mergeNodes(L, a.id, b.id);
        } else if (op < 0.88 && L.nodes.length > 0) {
          const n = L.nodes[Math.floor(rand() * L.nodes.length)];
          setNodePos(L, n.id, pt());
          settleNode(L, n.id, 30);
        } else if (op < 0.95 && L.walls.length > 0) {
          const w = L.walls[Math.floor(rand() * L.walls.length)];
          const type = (['door', 'window', 'opening'] as const)[Math.floor(rand() * 3)];
          addOpening(L, w.id, type, rand() * 3000);
          if (rand() < 0.2) openUpWall(L, w.id);
        } else {
          const o = L.walls.flatMap((w) => w.openings)[0];
          if (o) deleteOpening(L, o.id);
          const cat = CATALOGUE[Math.floor(rand() * CATALOGUE.length)];
          L.items.push(newPlacedItem(cat, pt(), Math.floor(rand() * 8) * 45));
        }
        clampOpenings(L);
        pruneGroups(L);
        check(L, `seed ${seed} step ${step}`);
      }
      for (const w of L.walls.slice(0, 8)) expect(Number.isFinite(measureWallFace(L, w.id))).toBe(true);
    });
  }
});

describe('geometry edge cases', () => {
  it('ignores a zero-length wall', () => {
    const L = emptyLevel();
    expect(addWall(L, { x: 0, y: 0 }, { x: 0, y: 0 }, defaultWallProps())).toEqual([]);
    expect(addWall(L, { x: 0, y: 0 }, { x: 0.3, y: 0 }, defaultWallProps())).toEqual([]);
  });

  it('survives a stored wall whose two ends are the same point', () => {
    const L = emptyLevel();
    L.nodes.push({ id: 'a', pos: { x: 0, y: 0 } }, { id: 'b', pos: { x: 0, y: 0 } }, { id: 'c', pos: { x: 1000, y: 0 } });
    L.walls.push(
      { id: 'w1', a: 'a', b: 'b', thickness: 100, kind: 'internal', structural: 'unknown', openings: [] },
      { id: 'w2', a: 'b', b: 'c', thickness: 100, kind: 'internal', structural: 'unknown', openings: [] },
    );
    check(L, 'zero-length stored wall');
  });

  it('keeps rooms away from loops of fewer than three corners', () => {
    const L = emptyLevel();
    addWall(L, { x: 0, y: 0 }, { x: 1000, y: 0 }, defaultWallProps());
    addWall(L, { x: 0, y: 0 }, { x: 1000, y: 0 }, defaultWallProps()); // same wall again
    check(L, 'doubled wall');
    expect(L.rooms).toEqual([]);
  });
});
