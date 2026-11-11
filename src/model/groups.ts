// Multi-select and groups of furniture. Pure functions over a level, written to
// run inside immer recipes (they mutate the draft they are given) and in tests.
//
// - A selection of several pieces is `{ kind: 'items', ids }`.
// - A group (`Level.groups`) is a named set of 2 or more pieces. Clicking one
//   member selects them all; moving, turning, duplicating and deleting act on
//   the whole set.

import type { Id, ItemGroup, Level, PlacedItem, Vec2 } from './types';
import type { Selection } from './store';
import { uid } from './ids';

// ---- selections ------------------------------------------------------------

/** The furniture ids in a selection (empty when it is not furniture). */
export function selectionIds(s: Selection): Id[] {
  if (!s) return [];
  if (s.kind === 'item') return [s.id];
  if (s.kind === 'items') return s.ids;
  return [];
}

/** The selection for a list of furniture ids: none, one piece, or several. */
export function selectionOf(ids: Id[]): Selection {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return null;
  if (unique.length === 1) return { kind: 'item', id: unique[0] };
  return { kind: 'items', ids: unique };
}

/** Add or remove ids from a list: ids already in it are removed, others added. */
export function toggleIds(current: Id[], ids: Id[]): Id[] {
  const all = ids.every((id) => current.includes(id));
  if (all) return current.filter((id) => !ids.includes(id));
  return [...current, ...ids.filter((id) => !current.includes(id))];
}

// ---- groups ----------------------------------------------------------------

export function groupOfItem(level: Pick<Level, 'groups'>, id: Id): ItemGroup | undefined {
  return (level.groups ?? []).find((g) => g.itemIds.includes(id));
}

/** The piece plus every other member of its group (just the piece when ungrouped). */
export function expandToGroup(level: Pick<Level, 'groups'>, id: Id): Id[] {
  return groupOfItem(level, id)?.itemIds ?? [id];
}

/** The group whose members are exactly these ids. */
export function groupMatching(level: Pick<Level, 'groups'>, ids: Id[]): ItemGroup | undefined {
  if (ids.length < 2) return undefined;
  return (level.groups ?? []).find((g) => g.itemIds.length === ids.length && ids.every((id) => g.itemIds.includes(id)));
}

/**
 * Drop members that no longer exist, and dissolve a group with fewer than 2
 * members. A piece is in at most one group. Runs after every edit.
 */
export function pruneGroups(level: Level): void {
  if (!level.groups) return;
  const exists = new Set(level.items.map((i) => i.id));
  const taken = new Set<Id>();
  const out: ItemGroup[] = [];
  let changed = false;
  for (const g of level.groups) {
    const members = g.itemIds.filter((id) => exists.has(id) && !taken.has(id));
    if (members.length < 2) {
      changed = true;
      continue;
    }
    for (const id of members) taken.add(id);
    if (members.length !== g.itemIds.length) {
      g.itemIds = members;
      changed = true;
    }
    out.push(g);
  }
  if (out.length === 0) delete level.groups;
  else if (changed) level.groups = out;
}

/** Group these pieces. They leave any group they were in. Returns the new group's id, or null if fewer than 2 exist. */
export function makeGroup(level: Level, ids: Id[], name: string): Id | null {
  const members = [...new Set(ids)].filter((id) => level.items.some((i) => i.id === id));
  if (members.length < 2) return null;
  for (const g of level.groups ?? []) g.itemIds = g.itemIds.filter((id) => !members.includes(id));
  const id = uid('g');
  const label = name.trim() || `Group ${(level.groups ?? []).length + 1}`;
  level.groups = [...(level.groups ?? []), { id, name: label, itemIds: members }];
  pruneGroups(level);
  return id;
}

export function ungroup(level: Level, groupId: Id): void {
  if (!level.groups) return;
  level.groups = level.groups.filter((g) => g.id !== groupId);
  if (level.groups.length === 0) delete level.groups;
}

export function renameGroup(level: Level, groupId: Id, name: string): void {
  const g = level.groups?.find((x) => x.id === groupId);
  if (g && name.trim()) g.name = name.trim();
}

// ---- moving, turning, copying, removing ------------------------------------

const present = (level: Level, ids: Id[]): PlacedItem[] => level.items.filter((i) => ids.includes(i.id));
const movable = (level: Level, ids: Id[]): PlacedItem[] => present(level, ids).filter((i) => !i.locked);

/** Move pieces by `delta` mm. Locked pieces stay put; moved pieces come off their wall. */
export function moveItems(level: Level, ids: Id[], delta: Vec2): void {
  for (const it of movable(level, ids)) {
    it.pos = { x: it.pos.x + delta.x, y: it.pos.y + delta.y };
    it.mountedTo = undefined;
  }
}

/** The middle of a set of pieces (the middle of the box their centres span). */
export function centreOf(items: { pos: Vec2 }[]): Vec2 {
  if (items.length === 0) return { x: 0, y: 0 };
  const xs = items.map((i) => i.pos.x);
  const ys = items.map((i) => i.pos.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Turn pieces by `deg` (a multiple of 90, clockwise is positive) about the
 * middle of the set, so a group keeps its shape. Locked pieces stay put.
 */
export function turnItems(level: Level, ids: Id[], deg: number): void {
  const items = movable(level, ids);
  if (items.length === 0) return;
  const c = centreOf(items);
  const rad = (deg * Math.PI) / 180;
  const cos = Math.round(Math.cos(rad) * 1e6) / 1e6;
  const sin = Math.round(Math.sin(rad) * 1e6) / 1e6;
  for (const it of items) {
    const dx = it.pos.x - c.x;
    const dy = it.pos.y - c.y;
    // Screen y points down, so a positive angle turns clockwise on screen.
    it.pos = { x: round2(c.x + dx * cos - dy * sin), y: round2(c.y + dx * sin + dy * cos) };
    it.rotationDeg = (((it.rotationDeg + deg) % 360) + 360) % 360;
    it.mountedTo = undefined;
  }
}

/**
 * Copy pieces, nudged 300 mm. Groups whose members are all copied get a copy
 * too, with new ids for the group and its members. Returns the new piece ids.
 */
export function duplicateItems(level: Level, ids: Id[]): Id[] {
  const map = new Map<Id, Id>();
  const copies: PlacedItem[] = [];
  for (const it of present(level, ids)) {
    const id = uid('i');
    map.set(it.id, id);
    copies.push({
      ...it,
      id,
      pos: { x: it.pos.x + 300, y: it.pos.y + 300 },
      dims: { ...it.dims },
      ...(it.params ? { params: { ...it.params } } : {}),
      locked: false,
      mountedTo: undefined,
    });
  }
  level.items.push(...copies);
  const groups: ItemGroup[] = [];
  for (const g of level.groups ?? []) {
    if (g.itemIds.every((id) => map.has(id))) groups.push({ id: uid('g'), name: `${g.name} copy`, itemIds: g.itemIds.map((id) => map.get(id)!) });
  }
  if (groups.length) level.groups = [...(level.groups ?? []), ...groups];
  return copies.map((c) => c.id);
}

/** Remove pieces. Their groups lose them, and dissolve below 2 members. */
export function removeItems(level: Level, ids: Id[]): void {
  level.items = level.items.filter((i) => !ids.includes(i.id));
  pruneGroups(level);
}

// ---- align and space evenly ------------------------------------------------

/** The box a piece fills on the plan, in mm. */
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type AlignMode = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom';

/** How far each box must move (mm) to line up with the others. Same order as `boxes`. */
export function alignDeltas(boxes: Box[], mode: AlignMode): Vec2[] {
  if (boxes.length === 0) return [];
  const minX = Math.min(...boxes.map((b) => b.minX));
  const maxX = Math.max(...boxes.map((b) => b.maxX));
  const minY = Math.min(...boxes.map((b) => b.minY));
  const maxY = Math.max(...boxes.map((b) => b.maxY));
  return boxes.map((b) => {
    switch (mode) {
      case 'left':
        return { x: minX - b.minX, y: 0 };
      case 'right':
        return { x: maxX - b.maxX, y: 0 };
      case 'centre':
        return { x: (minX + maxX) / 2 - (b.minX + b.maxX) / 2, y: 0 };
      case 'top':
        return { x: 0, y: minY - b.minY };
      case 'bottom':
        return { x: 0, y: maxY - b.maxY };
      case 'middle':
        return { x: 0, y: (minY + maxY) / 2 - (b.minY + b.maxY) / 2 };
    }
  });
}

/**
 * How far each box must move so the gaps between neighbours are equal, keeping
 * the first and last where they are. Needs 3 or more; otherwise nothing moves.
 * `axis` 'x' spaces them across, 'y' down. Same order as `boxes`.
 */
export function spaceDeltas(boxes: Box[], axis: 'x' | 'y'): Vec2[] {
  const out: Vec2[] = boxes.map(() => ({ x: 0, y: 0 }));
  if (boxes.length < 3) return out;
  const lo = (b: Box) => (axis === 'x' ? b.minX : b.minY);
  const hi = (b: Box) => (axis === 'x' ? b.maxX : b.maxY);
  const order = boxes.map((_, i) => i).sort((a, b) => lo(boxes[a]) - lo(boxes[b]));
  const first = boxes[order[0]];
  const span = Math.max(...boxes.map(hi)) - lo(first);
  const sizes = order.reduce((t, i) => t + (hi(boxes[i]) - lo(boxes[i])), 0);
  const gap = (span - sizes) / (boxes.length - 1);
  let cursor = lo(first);
  for (const i of order) {
    const d = cursor - lo(boxes[i]);
    out[i] = axis === 'x' ? { x: d, y: 0 } : { x: 0, y: d };
    cursor += hi(boxes[i]) - lo(boxes[i]) + gap;
  }
  return out;
}

/** Apply per-piece moves (same order as `ids`); locked pieces stay put. */
export function applyDeltas(level: Level, ids: Id[], deltas: Vec2[]): void {
  ids.forEach((id, k) => {
    const it = level.items.find((i) => i.id === id);
    const d = deltas[k];
    if (!it || it.locked || !d || (d.x === 0 && d.y === 0)) return;
    it.pos = { x: Math.round(it.pos.x + d.x), y: Math.round(it.pos.y + d.y) };
    it.mountedTo = undefined;
  });
}
