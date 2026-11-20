// Timings of the derived geometry on a busy plan (the seed plus 150 pieces,
// 30 notes). Prints numbers; the limits are loose so a slow machine does not
// fail the build, but a change that makes things 10x slower will.

import { describe, expect, it } from 'vitest';
import { stressProject } from './fuzzHelpers';
import { computeJoints } from '../geometry/joints';
import { detectRooms } from '../geometry/rooms';
import { wallDimensions } from '../geometry/dimensions';
import { runRules } from '../rules/engine';
import { activeLevelsResolved } from '../model/schemes';
import { buildLevel } from '../view3d/sceneBuild';
import type { Level } from '../model/types';

function time(fn: () => void, n = 20): number {
  fn(); // warm up
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn();
  return (performance.now() - t0) / n;
}

describe('performance on a busy plan', () => {
  const project = stressProject(150, 30);
  const levels = activeLevelsResolved(project);
  const withItems = levels.filter((l) => l.items.length > 0);
  const fresh = (l: Level): Level => ({ ...l, walls: [...l.walls], nodes: [...l.nodes], items: [...l.items] });

  it('measures the core functions', () => {
    const rows: Record<string, number> = {};
    rows.computeJoints = time(() => levels.forEach((l) => computeJoints(l)));
    rows.detectRooms = time(() => levels.forEach((l) => detectRooms(l)));
    rows.wallDimensions = time(() =>
      levels.forEach((l) => {
        const J = computeJoints(l);
        wallDimensions(l, J, detectRooms(l, J));
      }),
    );
    // Rules on new level objects each time: no memo, geometry rebuilt.
    rows.runRulesCold = time(() => withItems.forEach((l) => runRules(fresh(l), project)), 5);
    // Rules after only furniture changed: wall geometry is reused from the cache.
    withItems.forEach((l) => runRules(l, project));
    rows.runRulesItemsMoved = time(
      () =>
        withItems.forEach((l) => {
          const moved: Level = { ...l, items: l.items.map((i, k) => (k === 0 ? { ...i, pos: { x: i.pos.x + 1, y: i.pos.y } } : i)) };
          runRules(moved, project);
        }),
      5,
    );
    // Same level object again: memo hit.
    rows.runRulesMemoHit = time(() => withItems.forEach((l) => runRules(l, project)), 200);
    rows.buildLevel3D = time(() => levels.forEach((l) => buildLevel(l, project)), 3);
    console.log(
      `\nperf (ms, all ${levels.length} floors, ${project.levels.reduce((n, l) => n + l.items.length, 0)} items)\n` +
        Object.entries(rows)
          .map(([k, v]) => `  ${k.padEnd(22)} ${v.toFixed(2)}`)
          .join('\n'),
    );
    expect(rows.runRulesMemoHit).toBeLessThan(5);
    expect(rows.computeJoints).toBeLessThan(200);
  });
});
