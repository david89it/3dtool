// Doing what the plan's context menu offers. Every choice goes through the same
// store edits and geometry functions as the panels, so it is one undo step and saved.

import type { Id, Level } from '../model/types';
import { currentLevel, useStore } from '../model/store';
import { deleteWall, splitWall } from '../geometry/wallGraph';
import { deleteOpening, openUpWall } from '../geometry/openingEdits';
import { findOpening, isStructural, OPENING_LABEL } from '../geometry/openings';
import { addNote, deleteNote, makeNote } from '../model/notes';
import { expandToGroup, groupMatching, selectionIds, selectionOf } from '../model/groups';
import { deleteSelected, duplicateSelected, groupSelected, lockSelected, turnSelected, ungroupSelected } from './selectionActions';
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
  if (hit.kind === 'item') {
    // Pressing a piece that is already selected keeps the selection (so a set can be turned or
    // deleted); otherwise it selects that piece, or its whole group.
    const level = currentLevel();
    const prior = selectionIds(s.selection);
    hit.prior = prior;
    if (!prior.includes(hit.id)) s.select(selectionOf(level ? expandToGroup(level, hit.id) : [hit.id]));
    const now = selectionIds(useStore.getState().selection);
    hit.count = now.length;
    hit.locked = !!level && now.every((id) => level.items.find((i) => i.id === id)?.locked);
    hit.groupId = level && groupMatching(level, now)?.id;
    hit.addable = prior.length > 0 && !prior.includes(hit.id) && s.mode === 'furnish';
    return;
  }
  if (hit.kind === 'wall' || hit.kind === 'note') s.select({ kind: hit.kind, id: hit.id });
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
      turnSelected(90);
      return;
    case 'item.duplicate':
      duplicateSelected();
      return;
    case 'item.lock':
      lockSelected();
      return;
    case 'item.delete':
      deleteSelected();
      return;
    case 'item.addToSelection': {
      if (hit.kind !== 'item') return;
      s.select(selectionOf([...(hit.prior ?? []), ...selectionIds(s.selection)]));
      return;
    }
    case 'item.group':
      // Named "Group 1", "Group 2"...; the name field in the panel takes focus so she can rename it.
      if (groupSelected('')) showDetails('[aria-label="Group name"]');
      return;
    case 'item.ungroup':
      ungroupSelected();
      return;
    case 'group.rename':
      showDetails('[aria-label="Group name"]');
      return;
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
