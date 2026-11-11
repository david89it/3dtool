// The right-click / long-press menu on the plan. This file is the pure half:
// what is under the pointer, and which choices that offers. Doing the choice
// lives in contextActions.ts.

import type { Id, Level, Project, Vec2 } from '../model/types';
import type { Derived } from './tools/types';
import type { View } from './view';
import { hitRoom, hitWall } from './hitTest';
import { hitItem } from './itemHit';
import { hitNote } from './pins';
import { hitOpening } from '../geometry/openings';

/** What is under the pointer. `world` is the plan point (mm). */
export type ContextHit =
  | { kind: 'wall'; id: Id; world: Vec2 }
  | { kind: 'opening'; id: Id; wallId: Id; isDoor: boolean; world: Vec2 }
  | { kind: 'item'; id: Id; locked: boolean; world: Vec2 }
  | { kind: 'note'; id: Id; world: Vec2 }
  | { kind: 'room'; id: Id | null; nodeIds: Id[]; world: Vec2 }
  | { kind: 'empty'; world: Vec2 };

export type ContextAction =
  | 'wall.split'
  | 'wall.openUp'
  | 'wall.delete'
  | 'wall.properties'
  | 'opening.swapHinge'
  | 'opening.delete'
  | 'item.turn'
  | 'item.duplicate'
  | 'item.lock'
  | 'item.delete'
  | 'note.edit'
  | 'note.delete'
  | 'room.rename'
  | 'room.frame'
  | 'empty.addNote'
  | 'empty.fit';

export interface ContextEntry {
  action: ContextAction;
  label: string;
  danger?: boolean;
  disabled?: boolean;
}

/** The choices for what is under the pointer, in plain words. */
export function contextEntries(hit: ContextHit): ContextEntry[] {
  switch (hit.kind) {
    case 'wall':
      return [
        { action: 'wall.split', label: 'Split here' },
        { action: 'wall.openUp', label: 'Open up this wall' },
        { action: 'wall.delete', label: 'Delete', danger: true },
        { action: 'wall.properties', label: 'Properties…' },
      ];
    case 'opening':
      return [
        ...(hit.isDoor ? [{ action: 'opening.swapHinge' as const, label: 'Swap hinge' }] : []),
        { action: 'opening.delete', label: 'Delete', danger: true },
      ];
    case 'item':
      return [
        { action: 'item.turn', label: 'Turn 90°', disabled: hit.locked },
        { action: 'item.duplicate', label: 'Duplicate' },
        { action: 'item.lock', label: hit.locked ? 'Unlock' : 'Lock' },
        { action: 'item.delete', label: 'Delete', danger: true },
      ];
    case 'note':
      return [
        { action: 'note.edit', label: 'Edit' },
        { action: 'note.delete', label: 'Delete', danger: true },
      ];
    case 'room':
      return [
        { action: 'room.rename', label: 'Rename…', disabled: hit.id === null },
        { action: 'room.frame', label: 'Frame this room' },
      ];
    case 'empty':
      return [
        { action: 'empty.addNote', label: 'Add a note here' },
        { action: 'empty.fit', label: 'Fit the plan' },
      ];
  }
}

/**
 * Find what is under a point: notes first (they sit on top), then furniture, openings,
 * walls and rooms. Uses the same hit tests as the select tools.
 */
export function hitForContext(level: Level, project: Project, derived: Derived, view: View, screen: Vec2, world: Vec2): ContextHit {
  const note = hitNote(level, view, screen);
  if (note) return { kind: 'note', id: note.id, world };
  const item = hitItem(level, project, world);
  if (item) return { kind: 'item', id: item.id, locked: !!item.locked, world };
  const op = hitOpening(level, derived.joints, world, 10 / view.scale);
  if (op) return { kind: 'opening', id: op.opening.id, wallId: op.wall.id, isDoor: op.opening.type === 'door', world };
  const wallId = hitWall(level, derived.joints, view, world);
  if (wallId) return { kind: 'wall', id: wallId, world };
  const room = hitRoom(derived.rooms, world);
  if (room) {
    const stored = level.rooms.find((r) => r.boundary.join('|') === room.nodeIds.join('|'));
    return { kind: 'room', id: stored?.id ?? null, nodeIds: room.nodeIds, world };
  }
  return { kind: 'empty', world };
}
