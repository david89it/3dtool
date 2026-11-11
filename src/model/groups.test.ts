import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import type { Level, PlacedItem } from './types';
import { blankLevel } from '../geometry/testUtils';
import {
  alignDeltas,
  applyDeltas,
  duplicateItems,
  expandToGroup,
  groupMatching,
  makeGroup,
  moveItems,
  pruneGroups,
  removeItems,
  selectionIds,
  selectionOf,
  spaceDeltas,
  toggleIds,
  turnItems,
  ungroup,
  type Box,
} from './groups';
import { cloneLevel } from './schemes';
import { diffProjectsAll } from './diffProjects';

function item(id: string, x: number, y: number, extra: Partial<PlacedItem> = {}): PlacedItem {
  return { id, catalogueId: 'chair', pos: { x, y }, rotationDeg: 0, dims: { w: 500, d: 500, h: 900 }, ...extra };
}

function level(): Level {
  const L = blankLevel();
  L.items = [item('a', 0, 0), item('b', 1000, 0), item('c', 1000, 1000), item('d', 5000, 5000)];
  return L;
}

const edit = (L: Level, fn: (draft: Level) => void): Level => produce(L, fn);

describe('selection helpers', () => {
  it('turns ids into the right selection kind', () => {
    expect(selectionOf([])).toBeNull();
    expect(selectionOf(['a'])).toEqual({ kind: 'item', id: 'a' });
    expect(selectionOf(['a', 'b', 'a'])).toEqual({ kind: 'items', ids: ['a', 'b'] });
    expect(selectionIds({ kind: 'items', ids: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(selectionIds({ kind: 'wall', id: 'w' })).toEqual([]);
  });
  it('toggles ids in and out', () => {
    expect(toggleIds(['a'], ['b'])).toEqual(['a', 'b']);
    expect(toggleIds(['a', 'b'], ['b'])).toEqual(['a']);
  });
});

describe('groups', () => {
  it('groups, finds a group from any member, and ungroups', () => {
    const g = edit(level(), (d) => void makeGroup(d, ['a', 'b', 'c'], 'Dining set'));
    expect(g.groups).toHaveLength(1);
    expect(g.groups![0].name).toBe('Dining set');
    expect([...expandToGroup(g, 'b')].sort()).toEqual(['a', 'b', 'c']);
    expect(expandToGroup(g, 'd')).toEqual(['d']);
    expect(groupMatching(g, ['c', 'a', 'b'])?.name).toBe('Dining set');
    expect(groupMatching(g, ['a', 'b'])).toBeUndefined();
    const u = edit(g, (d) => ungroup(d, g.groups![0].id));
    expect(u.groups).toBeUndefined();
  });

  it('names an unnamed group, and a piece leaves its old group when regrouped', () => {
    let g = edit(level(), (d) => void makeGroup(d, ['a', 'b', 'c'], ''));
    expect(g.groups![0].name).toBe('Group 1');
    g = edit(g, (d) => void makeGroup(d, ['c', 'd'], 'Pair'));
    // The first group is left with a and b, still a group of 2.
    expect(g.groups!.map((x) => x.itemIds)).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('moves a group together, leaving locked pieces where they are', () => {
    const L = level();
    L.items[1].locked = true;
    const moved = edit(L, (d) => moveItems(d, ['a', 'b', 'c'], { x: 100, y: -50 }));
    expect(moved.items[0].pos).toEqual({ x: 100, y: -50 });
    expect(moved.items[1].pos).toEqual({ x: 1000, y: 0 });
    expect(moved.items[2].pos).toEqual({ x: 1100, y: 950 });
    expect(moved.items[3].pos).toEqual({ x: 5000, y: 5000 });
  });

  it('turns a group 90 degrees clockwise about its centre', () => {
    const L = blankLevel();
    L.items = [item('a', 0, 0), item('b', 2000, 0)];
    const t = edit(L, (d) => turnItems(d, ['a', 'b'], 90));
    // Centre is (1000, 0). The left piece goes to the top, the right piece to the bottom.
    expect(t.items[0].pos).toEqual({ x: 1000, y: -1000 });
    expect(t.items[1].pos).toEqual({ x: 1000, y: 1000 });
    expect(t.items.map((i) => i.rotationDeg)).toEqual([90, 90]);
    // Four turns come back to the start.
    let r = L;
    for (let k = 0; k < 4; k++) r = edit(r, (d) => turnItems(d, ['a', 'b'], 90));
    expect(r.items.map((i) => i.pos)).toEqual([{ x: 0, y: 0 }, { x: 2000, y: 0 }]);
    expect(r.items.map((i) => i.rotationDeg)).toEqual([0, 0]);
    // And the other way.
    const back = edit(t, (d) => turnItems(d, ['a', 'b'], -90));
    expect(back.items.map((i) => i.pos)).toEqual([{ x: 0, y: 0 }, { x: 2000, y: 0 }]);
  });

  it('turns a single piece about itself', () => {
    const t = edit(level(), (d) => turnItems(d, ['d'], 90));
    expect(t.items[3].pos).toEqual({ x: 5000, y: 5000 });
    expect(t.items[3].rotationDeg).toBe(90);
  });

  it('duplicates a group with new ids for the pieces and the group', () => {
    let g = edit(level(), (d) => {
      makeGroup(d, ['a', 'b', 'c'], 'Dining set');
      d.items[0].locked = true;
    });
    let copies: string[] = [];
    g = edit(g, (d) => {
      copies = duplicateItems(d, ['a', 'b', 'c']);
    });
    expect(g.items).toHaveLength(7);
    expect(copies).toHaveLength(3);
    for (const id of copies) expect(['a', 'b', 'c', 'd']).not.toContain(id);
    expect(g.groups).toHaveLength(2);
    const [orig, copy] = g.groups!;
    expect(copy.id).not.toBe(orig.id);
    expect(copy.itemIds).toEqual(copies);
    expect(copy.name).toBe('Dining set copy');
    // Copies are offset, unlocked, and the originals are untouched.
    expect(g.items.find((i) => i.id === copies[0])!.locked).toBe(false);
    expect(g.items.find((i) => i.id === copies[0])!.pos).toEqual({ x: 300, y: 300 });
    expect(orig.itemIds).toEqual(['a', 'b', 'c']);
  });

  it('does not copy a group when only some of it is duplicated', () => {
    let g = edit(level(), (d) => void makeGroup(d, ['a', 'b', 'c'], 'Dining set'));
    g = edit(g, (d) => void duplicateItems(d, ['a', 'b']));
    expect(g.groups).toHaveLength(1);
    expect(g.items).toHaveLength(6);
  });

  it('removes a deleted piece from its group, and dissolves a group left with fewer than 2', () => {
    let g = edit(level(), (d) => void makeGroup(d, ['a', 'b', 'c'], 'Dining set'));
    g = edit(g, (d) => removeItems(d, ['c']));
    expect(g.groups![0].itemIds).toEqual(['a', 'b']);
    g = edit(g, (d) => removeItems(d, ['b']));
    expect(g.groups).toBeUndefined();
  });

  it('prunes by itself when pieces vanish some other way', () => {
    let g = edit(level(), (d) => void makeGroup(d, ['a', 'b'], 'Pair'));
    g = edit(g, (d) => {
      d.items = d.items.filter((i) => i.id !== 'a');
      pruneGroups(d);
    });
    expect(g.groups).toBeUndefined();
  });

  it('carries groups into a copied option with every id remapped', () => {
    const L = edit(level(), (d) => void makeGroup(d, ['a', 'b', 'c'], 'Dining set'));
    const c = cloneLevel(L);
    expect(c.groups).toHaveLength(1);
    expect(c.groups![0].id).not.toBe(L.groups![0].id);
    expect(c.groups![0].name).toBe('Dining set');
    const newIds = c.items.map((i) => i.id);
    expect(c.groups![0].itemIds.every((id) => newIds.includes(id))).toBe(true);
    expect(c.groups![0].itemIds.some((id) => ['a', 'b', 'c'].includes(id))).toBe(false);
    // The original is untouched.
    expect(L.groups![0].itemIds).toEqual(['a', 'b', 'c']);
  });

  it('says "Group added" in the versions change list', () => {
    const before = { version: 1 as const, name: 'p', levels: [level()], catalogueOverrides: [] };
    const after = { ...before, levels: [edit(before.levels[0], (d) => void makeGroup(d, ['a', 'b'], 'Dining set'))] };
    expect(diffProjectsAll(before, after).join('|')).toContain("Group 'Dining set' added");
    expect(diffProjectsAll(after, before).join('|')).toContain("Group 'Dining set' removed");
  });
});

describe('align and space evenly', () => {
  const box = (minX: number, minY: number, w: number, h: number): Box => ({ minX, minY, maxX: minX + w, maxY: minY + h });
  const boxes = [box(0, 0, 100, 100), box(300, 50, 200, 100), box(700, 200, 100, 300)];
  const uneven = [box(0, 0, 100, 100), box(150, 0, 200, 100), box(700, 0, 100, 100)];

  it('aligns edges, centres and middles', () => {
    expect(alignDeltas(boxes, 'left').map((d) => d.x)).toEqual([0, -300, -700]);
    expect(alignDeltas(boxes, 'right').map((d) => d.x)).toEqual([700, 300, 0]);
    expect(alignDeltas(boxes, 'centre').map((d) => d.x)).toEqual([350, 0, -350]);
    expect(alignDeltas(boxes, 'top').map((d) => d.y)).toEqual([0, -50, -200]);
    expect(alignDeltas(boxes, 'bottom').map((d) => d.y)).toEqual([400, 350, 0]);
    expect(alignDeltas(boxes, 'middle').map((d) => d.y)).toEqual([200, 150, -100]);
  });

  it('spaces three pieces with equal gaps, keeping the ends fixed', () => {
    // Widths 100, 200, 100 over a span of 800: gaps of (800 - 400) / 2 = 200, so the middle
    // piece starts at 300 instead of 150.
    const d = spaceDeltas(uneven, 'x');
    expect(d.map((v) => v.x)).toEqual([0, 150, 0]);
    expect(d.every((v) => v.y === 0)).toBe(true);
  });

  it('spaces by position, not by the order of the list', () => {
    const shuffled = [uneven[2], uneven[0], uneven[1]];
    expect(spaceDeltas(shuffled, 'x').map((v) => v.x)).toEqual([0, 0, 150]);
  });

  it('spaces down as well', () => {
    const col = [box(0, 0, 100, 100), box(0, 150, 100, 100), box(0, 1000, 100, 100)];
    // Span 1100, sizes 300, so two gaps of 400: tops at 0, 500, 1000.
    expect(spaceDeltas(col, 'y').map((v) => v.y)).toEqual([0, 350, 0]);
  });

  it('needs three or more', () => {
    expect(spaceDeltas(boxes.slice(0, 2), 'x')).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
  });

  it('applies moves but never to locked pieces', () => {
    const L = level();
    L.items[1].locked = true;
    const out = edit(L, (d) =>
      applyDeltas(d, ['a', 'b', 'c'], [
        { x: 10, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 20 },
      ]),
    );
    expect(out.items[0].pos).toEqual({ x: 10, y: 0 });
    expect(out.items[1].pos).toEqual({ x: 1000, y: 0 });
    expect(out.items[2].pos).toEqual({ x: 1000, y: 1020 });
  });
});
