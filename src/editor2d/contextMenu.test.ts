import { describe, expect, it } from 'vitest';
import type { Level, Project } from '../model/types';
import { addWall, defaultWallProps } from '../geometry/wallGraph';
import { addOpening } from '../geometry/openingEdits';
import { blankLevel } from '../geometry/testUtils';
import { computeJoints } from '../geometry/joints';
import { detectRooms, syncRooms } from '../geometry/rooms';
import { contextEntries, hitForContext, type ContextHit } from './contextMenu';
import type { Derived } from './tools/types';

const w = { x: 0, y: 0 };
const labels = (h: ContextHit) => contextEntries(h).map((e) => e.label);

describe('context menu entries', () => {
  it('offers wall choices', () => {
    expect(labels({ kind: 'wall', id: 'w1', world: w })).toEqual(['Split here', 'Open up this wall', 'Delete', 'Properties…']);
    expect(contextEntries({ kind: 'wall', id: 'w1', world: w }).map((e) => e.action)).toEqual([
      'wall.split',
      'wall.openUp',
      'wall.delete',
      'wall.properties',
    ]);
  });

  it('offers a hinge swap only for doors', () => {
    expect(labels({ kind: 'opening', id: 'o', wallId: 'w', isDoor: true, world: w })).toEqual(['Swap hinge', 'Delete']);
    expect(labels({ kind: 'opening', id: 'o', wallId: 'w', isDoor: false, world: w })).toEqual(['Delete']);
  });

  it('offers item choices, switching Lock to Unlock and disabling Turn when locked', () => {
    expect(labels({ kind: 'item', id: 'i', locked: false, world: w })).toEqual(['Turn 90°', 'Duplicate', 'Lock', 'Delete']);
    const locked = contextEntries({ kind: 'item', id: 'i', locked: true, world: w });
    expect(locked.map((e) => e.label)).toEqual(['Turn 90°', 'Duplicate', 'Unlock', 'Delete']);
    expect(locked[0].disabled).toBe(true);
    expect(locked[3].danger).toBe(true);
  });

  it('offers note, room and empty-floor choices', () => {
    expect(labels({ kind: 'note', id: 'n', world: w })).toEqual(['Edit', 'Delete']);
    expect(labels({ kind: 'room', id: 'r', nodeIds: [], world: w })).toEqual(['Rename…', 'Frame this room']);
    expect(labels({ kind: 'empty', world: w })).toEqual(['Add a note here', 'Fit the plan']);
  });
});

describe('hitForContext', () => {
  const view = { scale: 0.1, x: 0, y: 0 };
  const project = { version: 1, name: 't', levels: [], catalogueOverrides: [] } as unknown as Project;

  function room(): { L: Level; derived: Derived; doorId: string } {
    const L = blankLevel();
    const p = defaultWallProps('internal');
    const ids = [
      addWall(L, { x: 0, y: 0 }, { x: 4000, y: 0 }, p)[0],
      addWall(L, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, p)[0],
      addWall(L, { x: 4000, y: 3000 }, { x: 0, y: 3000 }, p)[0],
      addWall(L, { x: 0, y: 3000 }, { x: 0, y: 0 }, p)[0],
    ];
    const r = addOpening(L, ids[0], 'door', 2000, 900);
    syncRooms(L);
    const joints = computeJoints(L);
    return { L, derived: { joints, rooms: detectRooms(L, joints), dims: [] }, doorId: (r as { id: string }).id };
  }

  const at = (L: Level, d: Derived, x: number, y: number) =>
    hitForContext(L, project, d, view, { x: x * view.scale, y: y * view.scale }, { x, y });

  it('tells a door, a wall, a room and empty floor apart', () => {
    const { L, derived, doorId } = room();
    const door = at(L, derived, 2000, 0);
    expect(door.kind).toBe('opening');
    expect(door.kind === 'opening' && door.id).toBe(doorId);
    expect(door.kind === 'opening' && door.isDoor).toBe(true);
    expect(at(L, derived, 800, 0).kind).toBe('wall');
    const inside = at(L, derived, 2000, 1500);
    expect(inside.kind).toBe('room');
    expect(inside.kind === 'room' && inside.id).toBe(L.rooms[0].id);
    expect(at(L, derived, 9000, 9000).kind).toBe('empty');
  });
});
