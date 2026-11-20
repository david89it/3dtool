// The store must never be left looking at something that no longer exists.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('idb-keyval', () => ({ get: vi.fn(async () => undefined), set: vi.fn(async () => undefined), del: vi.fn(async () => undefined) }));

import { useStore } from './store';
import type { Project } from './types';
import { buildSeedProject } from './seed';
import { deleteOption, duplicateAsOption } from './schemes';
import { makeGroup } from './groups';
import { deleteWall } from '../geometry/wallGraph';
import { activeLevelsResolved } from './schemes';

function fresh(): Project {
  const p = buildSeedProject();
  useStore.getState().loadProject(p);
  return p;
}

beforeEach(() => {
  useStore.setState({ toasts: [] });
});

describe('floors and options', () => {
  it('keeps pointing at a real floor when deleting an option is undone and redone', () => {
    fresh();
    const s = () => useStore.getState();
    const first = s().project.levels.find((l) => /first/i.test(l.name))!;
    s().setLevel(first.id);
    let optionId: string | null = null;
    s().commit('Add option', (d) => void (optionId = duplicateAsOption(d as Project, first.id)));
    s().setLevel(optionId!);
    // The real order: delete the option she is looking at, move to the one that is left, then undo and redo.
    let left: string | null = null;
    s().commit('Delete option', (d) => void (left = deleteOption(d as Project, optionId!)));
    s().setLevel(left!);
    s().undo();
    expect(s().project.levels.some((l) => l.id === s().levelId)).toBe(true);
    s().redo();
    expect(s().project.levels.some((l) => l.id === s().levelId)).toBe(true);
  });

  it('points stairs at the option that is left when the option they led to is deleted', () => {
    const p = fresh();
    const s = () => useStore.getState();
    const first = p.levels.find((l) => /first/i.test(l.name))!;
    let optionId = '';
    s().commit('Add option', (d) => void (optionId = duplicateAsOption(d as Project, first.id) ?? ''));
    // A stair on the ground floor that leads to the new option.
    s().commit('Point stair at option', (d) => {
      const ground = d.levels.find((l) => l.stairs.some((st) => st.toLevelId === first.id));
      const st = ground!.stairs.find((x) => x.toLevelId === first.id)!;
      st.toLevelId = optionId;
    });
    s().commit('Delete option', (d) => void deleteOption(d as Project, optionId));
    const ids = new Set(s().project.levels.map((l) => l.id));
    for (const l of activeLevelsResolved(s().project)) for (const st of l.stairs) expect(ids.has(st.toLevelId), `${l.name} stair`).toBe(true);
  });
});

describe('selection and groups after things are deleted', () => {
  it('clears a selection on a wall that was deleted, and on one that undo removed', () => {
    fresh();
    const s = () => useStore.getState();
    const lvl = s().project.levels.find((l) => /first/i.test(l.name))!;
    s().setLevel(lvl.id);
    const wall = lvl.walls[0];
    s().select({ kind: 'wall', id: wall.id });
    s().editLevel('Delete wall', (L) => deleteWall(L, wall.id));
    expect(s().selection).toBeNull();
  });

  it('dissolves a group when one of its pieces is deleted', () => {
    fresh();
    const s = () => useStore.getState();
    const lvl = s().project.levels.find((l) => /first/i.test(l.name))!;
    s().setLevel(lvl.id);
    s().editLevel('Add chairs', (L) => {
      for (const id of ['a', 'b']) L.items.push({ id, catalogueId: 'chair-dining', pos: { x: 0, y: 0 }, rotationDeg: 0, dims: { w: 450, d: 450, h: 900 } });
      makeGroup(L, ['a', 'b'], 'Pair');
    });
    expect(s().project.levels.find((l) => l.id === lvl.id)!.groups).toHaveLength(1);
    s().editLevel('Delete a chair', (L) => void (L.items = L.items.filter((i) => i.id !== 'a')));
    expect(s().project.levels.find((l) => l.id === lvl.id)!.groups).toBeUndefined();
  });
});

describe('undo', () => {
  it('does not crash, and clears the list, if a step no longer fits the plan', () => {
    fresh();
    const s = () => useStore.getState();
    const lvl = s().project.levels.find((l) => /first/i.test(l.name))!;
    s().setLevel(lvl.id);
    s().editLevel('Rename', (L) => void (L.name = 'Renamed'));
    // Break the plan underneath the history, the way a bad import could.
    useStore.setState({ project: { ...s().project, levels: [] } });
    expect(() => s().undo()).not.toThrow();
    expect(s().past).toEqual([]);
    expect(s().toasts.length).toBeGreaterThan(0);
  });

  it('forgets history when a plan is loaded, so undo cannot reach into the old plan', () => {
    fresh();
    const s = () => useStore.getState();
    const lvl = s().project.levels[0];
    s().setLevel(lvl.id);
    s().editLevel('Rename', (L) => void (L.name = 'Renamed'));
    expect(s().past).toHaveLength(1);
    s().loadProject(buildSeedProject());
    expect(s().past).toEqual([]);
    expect(s().future).toEqual([]);
    s().undo();
    expect(s().project.levels[0].name).not.toBe('Renamed');
  });
});
