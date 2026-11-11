// Doing what the plan's context menu offers. Every choice goes through the same
// store edits and geometry functions as the panels, so it is one undo step and saved.

import type { Id, Level, PlacedItem } from '../model/types';
import { currentLevel, useStore } from '../model/store';
import { deleteWall, splitWall } from '../geometry/wallGraph';
import { deleteOpening, openUpWall } from '../geometry/openingEdits';
import { findOpening, isStructural, OPENING_LABEL } from '../geometry/openings';
import { addNote, deleteNote, makeNote } from '../model/notes';
import { findCatalogueItem } from '../catalogue/catalogue';
import { duplicateItem, rotateBy } from './itemOps';
import { canvasApi } from './canvasApi';
import { detectRooms } from '../geometry/rooms';
import { frameRoom } from '../ui/roomViews';
import { useLayout } from '../ui/layoutState';
import type { ContextAction, ContextHit } from './contextMenu';

/** Shown when a wall that may hold the building up is deleted. */
export const STRUCTURAL_DELETE_WARNING =
  'That wall may hold the building up. Removing it needs a structural engineer, steel, Building Control and the landlord’s licence. Undo puts it back.';

/** Open the wall with the widest opening it allows (the "Open up this wall" button). */
export function openUpWallAction(wallId: Id): void {
  const s = useStore.getState();
  let id: string | null = null;
  let error: string | null = null;
  s.snapshotBefore('opening up a wall');
  s.editLevel('Open up wall', (L) => {
    const r = openUpWall(L as Level, wallId);
    if ('id' in r) id = r.id;
    else error = r.error;
  });
  if (id) {
    s.setMode('openings');
    s.select({ kind: 'opening', id });
  } else if (error) s.toast(error, 'warn');
}

/** Delete a wall, keeping a safety copy first and warning when it may be structural. */
export function deleteWallAction(wallId: Id): void {
  const s = useStore.getState();
  const w = currentLevel()?.walls.find((x) => x.id === wallId);
  s.snapshotBefore('deleting a wall');
  s.editLevel('Delete wall', (L) => deleteWall(L as Level, wallId));
  s.select(null);
  if (w && isStructural(w)) s.toast(STRUCTURAL_DELETE_WARNING, 'warn');
}

/** Show the details panel (it may be collapsed) and put the cursor in a field once it has drawn. */
function showDetails(focusSelector?: string): void {
  useLayout.getState().setOpen('right', true);
  if (focusSelector) {
    setTimeout(() => {
      const el = document.querySelector(focusSelector) as HTMLElement | null;
      el?.focus();
      if (el instanceof HTMLInputElement) el.select();
    }, 80);
  }
}

/** Select what was under the pointer so the panel and the outline follow it. */
export function selectHit(hit: ContextHit): void {
  const s = useStore.getState();
  if (hit.kind === 'wall' || hit.kind === 'item' || hit.kind === 'note') s.select({ kind: hit.kind, id: hit.id });
  else if (hit.kind === 'opening') s.select({ kind: 'opening', id: hit.id });
  else if (hit.kind === 'room' && hit.id) s.select({ kind: 'room', id: hit.id });
}

export function runContextAction(action: ContextAction, hit: ContextHit): void {
  const s = useStore.getState();
  const level = currentLevel();
  if (!level) return;
  switch (action) {
    case 'wall.split': {
      if (hit.kind !== 'wall') return;
      s.editLevel('Split wall', (L) => void splitWall(L as Level, hit.id, hit.world));
      s.select({ kind: 'wall', id: hit.id });
      return;
    }
    case 'wall.openUp':
      if (hit.kind === 'wall') openUpWallAction(hit.id);
      return;
    case 'wall.delete':
      if (hit.kind === 'wall') deleteWallAction(hit.id);
      return;
    case 'wall.properties':
      if (hit.kind === 'wall') {
        s.select({ kind: 'wall', id: hit.id });
        showDetails();
      }
      return;
    case 'opening.swapHinge': {
      if (hit.kind !== 'opening') return;
      s.editLevel('Swap door hinge', (L) => {
        const f = findOpening(L as Level, hit.id);
        if (f?.opening.swing) f.opening.swing.hinge = f.opening.swing.hinge === 'start' ? 'end' : 'start';
      });
      return;
    }
    case 'opening.delete': {
      if (hit.kind !== 'opening') return;
      const f = findOpening(level, hit.id);
      const name = f ? OPENING_LABEL[f.opening.type].toLowerCase() : 'opening';
      s.editLevel(`Remove ${name}`, (L) => deleteOpening(L as Level, hit.id));
      s.select(null);
      return;
    }
    case 'item.turn':
    case 'item.duplicate':
    case 'item.lock':
    case 'item.delete': {
      if (hit.kind !== 'item') return;
      const item = level.items.find((i) => i.id === hit.id);
      if (!item) return;
      const name = (findCatalogueItem(s.project, item.catalogueId)?.name ?? 'item').toLowerCase();
      const change = (label: string, fn: (i: PlacedItem) => PlacedItem) =>
        s.editLevel(label, (L) => {
          const idx = L.items.findIndex((x) => x.id === hit.id);
          if (idx >= 0) L.items[idx] = fn(L.items[idx] as PlacedItem);
        });
      if (action === 'item.turn') {
        if (!item.locked) change(`Turn ${name}`, (i) => rotateBy(i, 90));
      } else if (action === 'item.duplicate') {
        const copy = duplicateItem(item);
        s.editLevel(`Duplicate ${name}`, (L) => void L.items.push(copy));
        s.select({ kind: 'item', id: copy.id });
      } else if (action === 'item.lock') {
        change(item.locked ? `Unlock ${name}` : `Lock ${name}`, (i) => ({ ...i, locked: !i.locked }));
      } else {
        s.editLevel(`Remove ${name}`, (L) => void (L.items = L.items.filter((x) => x.id !== hit.id)));
        s.select(null);
      }
      return;
    }
    case 'note.edit':
      if (hit.kind === 'note') {
        s.select({ kind: 'note', id: hit.id });
        showDetails('[aria-label="Note text"]');
      }
      return;
    case 'note.delete':
      if (hit.kind === 'note') {
        s.editLevel('Remove note', (L) => deleteNote(L as Level, hit.id));
        s.select(null);
      }
      return;
    case 'room.rename':
      if (hit.kind === 'room' && hit.id) {
        s.select({ kind: 'room', id: hit.id });
        showDetails('[aria-label="Room name"]');
      }
      return;
    case 'room.frame': {
      if (hit.kind !== 'room') return;
      const key = hit.nodeIds.join('|');
      const det = detectRooms(level).find((d) => d.nodeIds.join('|') === key);
      if (det) frameRoom(level, det);
      return;
    }
    case 'empty.addNote': {
      if (hit.kind !== 'empty') return;
      const note = makeNote('note', hit.world);
      s.editLevel('Add note', (L) => addNote(L as Level, note));
      s.select({ kind: 'note', id: note.id });
      showDetails('[aria-label="Note text"]');
      return;
    }
    case 'empty.fit':
      canvasApi.fit();
      return;
  }
}
