// What the keyboard, the panels and the right-click menu do to the selected
// furniture. One piece or many (a Shift selection, or a group) go through the
// same functions, so each is one undo step and every surface behaves the same.

import type { Id, Level } from '../model/types';
import { currentLevel, useStore } from '../model/store';
import { findCatalogueItem, footprint } from '../catalogue/catalogue';
import {
  alignDeltas,
  applyDeltas,
  duplicateItems,
  groupMatching,
  makeGroup,
  removeItems,
  renameGroup,
  selectionIds,
  selectionOf,
  spaceDeltas,
  turnItems,
  ungroup,
  type AlignMode,
  type Box,
} from '../model/groups';

/** Ids of the selected furniture on the current floor. */
export function selectedItemIds(): Id[] {
  const L = currentLevel();
  if (!L) return [];
  return selectionIds(useStore.getState().selection).filter((id) => L.items.some((i) => i.id === id));
}

function nameFor(ids: Id[]): string {
  const L = currentLevel();
  const s = useStore.getState();
  if (ids.length !== 1 || !L) return `${ids.length} pieces`;
  const it = L.items.find((i) => i.id === ids[0]);
  return (it && findCatalogueItem(s.project, it.catalogueId)?.name.toLowerCase()) || 'item';
}

export function turnSelected(deg: number): void {
  const ids = selectedItemIds();
  const L = currentLevel();
  if (!L || ids.length === 0) return;
  if (ids.every((id) => L.items.find((i) => i.id === id)?.locked)) return;
  useStore.getState().editLevel(`Turn ${nameFor(ids)}`, (draft) => turnItems(draft as Level, ids, deg));
}

export function duplicateSelected(): void {
  const ids = selectedItemIds();
  if (ids.length === 0) return;
  const s = useStore.getState();
  let copies: Id[] = [];
  s.editLevel(`Duplicate ${nameFor(ids)}`, (draft) => {
    copies = duplicateItems(draft as Level, ids);
  });
  s.select(selectionOf(copies));
}

/** Lock all of them, or unlock all when they are all locked already. */
export function lockSelected(): void {
  const ids = selectedItemIds();
  const L = currentLevel();
  if (!L || ids.length === 0) return;
  const allLocked = ids.every((id) => L.items.find((i) => i.id === id)?.locked);
  useStore.getState().editLevel(`${allLocked ? 'Unlock' : 'Lock'} ${nameFor(ids)}`, (draft) => {
    for (const it of draft.items) if (ids.includes(it.id)) it.locked = !allLocked;
  });
}

export function deleteSelected(): void {
  const ids = selectedItemIds();
  if (ids.length === 0) return;
  const s = useStore.getState();
  s.editLevel(`Remove ${nameFor(ids)}`, (draft) => removeItems(draft as Level, ids));
  s.select(null);
}

/** Make the selected pieces a group. Returns false when fewer than 2 are selected. */
export function groupSelected(name: string): boolean {
  const ids = selectedItemIds();
  if (ids.length < 2) return false;
  const label = name.trim();
  useStore.getState().editLevel(label ? `Group “${label}”` : 'Group pieces', (draft) => void makeGroup(draft as Level, ids, name));
  return true;
}

export function ungroupSelected(): void {
  const L = currentLevel();
  const g = L && groupMatching(L, selectedItemIds());
  if (!g) return;
  useStore.getState().editLevel(`Ungroup “${g.name}”`, (draft) => ungroup(draft as Level, g.id));
}

export function renameGroupById(groupId: Id, name: string): void {
  const L = currentLevel();
  const g = L?.groups?.find((x) => x.id === groupId);
  if (!g || !name.trim() || g.name === name.trim()) return;
  useStore.getState().editLevel(`Rename group “${g.name}”`, (draft) => renameGroup(draft as Level, groupId, name));
}

/** Add a piece (and its group) to, or take it out of, the selection. */
export function toggleInSelection(ids: Id[]): void {
  const s = useStore.getState();
  const cur = selectionIds(s.selection);
  const all = ids.every((id) => cur.includes(id));
  s.select(selectionOf(all ? cur.filter((id) => !ids.includes(id)) : [...cur, ...ids.filter((id) => !cur.includes(id))]));
}

function boxesOf(level: Level, ids: Id[]): Box[] {
  const s = useStore.getState();
  return ids.map((id) => {
    const it = level.items.find((i) => i.id === id)!;
    const cat = findCatalogueItem(s.project, it.catalogueId);
    const pts = cat ? footprint(it, cat) : [it.pos];
    return {
      minX: Math.min(...pts.map((p) => p.x)),
      maxX: Math.max(...pts.map((p) => p.x)),
      minY: Math.min(...pts.map((p) => p.y)),
      maxY: Math.max(...pts.map((p) => p.y)),
    };
  });
}

const ALIGN_LABEL: Record<AlignMode, string> = {
  left: 'Align left',
  centre: 'Align centres',
  right: 'Align right',
  top: 'Align tops',
  middle: 'Align middles',
  bottom: 'Align bottoms',
};

export function alignSelected(mode: AlignMode): void {
  const ids = selectedItemIds();
  const L = currentLevel();
  if (!L || ids.length < 2) return;
  const deltas = alignDeltas(boxesOf(L, ids), mode);
  useStore.getState().editLevel(ALIGN_LABEL[mode], (draft) => applyDeltas(draft as Level, ids, deltas));
}

/** Equal gaps between 3 or more pieces: 'x' spreads them across, 'y' down. */
export function spaceSelected(axis: 'x' | 'y'): void {
  const ids = selectedItemIds();
  const L = currentLevel();
  if (!L || ids.length < 3) return;
  const deltas = spaceDeltas(boxesOf(L, ids), axis);
  useStore.getState().editLevel(axis === 'x' ? 'Space evenly across' : 'Space evenly down', (draft) => applyDeltas(draft as Level, ids, deltas));
}
