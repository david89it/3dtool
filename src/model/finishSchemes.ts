// Saved colour schemes: a room's floor, wall, ceiling and woodwork finish kept
// under the room's NAME, so a scheme saved on one option applies to any other
// option or floor that has rooms of the same names. (Not the floor "options"
// in schemes.ts.) Feature-wall paint on single faces (Wall.faces) belongs to a
// wall, not a room, so it is neither saved nor changed.

import type { FinishScheme, Level, Room, RoomFinishes } from './types';
import { uid } from './ids';

export function roomFinishes(room: Pick<Room, 'floorFinish' | 'wallFinish' | 'ceilingFinish' | 'woodworkColor'>): RoomFinishes {
  const out: RoomFinishes = {};
  if (room.floorFinish) out.floor = room.floorFinish;
  if (room.wallFinish) out.walls = room.wallFinish;
  if (room.ceilingFinish) out.ceiling = room.ceilingFinish;
  if (room.woodworkColor) out.woodwork = room.woodworkColor;
  return out;
}

/** A scheme holding every room of a floor. Rooms that share a name keep the last one. */
export function makeScheme(level: Pick<Level, 'rooms'>, name: string): FinishScheme {
  const rooms: Record<string, RoomFinishes> = {};
  for (const r of level.rooms) rooms[r.name] = roomFinishes(r);
  return { id: uid('sch'), name: name.trim() || 'My scheme', rooms };
}

/**
 * Apply a scheme to a floor (mutates it, e.g. inside an immer recipe). Rooms
 * are matched by name; a field the scheme leaves out is cleared, so the room
 * ends up looking as it did when the scheme was saved. Returns how many rooms
 * were matched.
 */
export function applyScheme(level: Pick<Level, 'rooms'>, scheme: Pick<FinishScheme, 'rooms'>): number {
  let matched = 0;
  for (const r of level.rooms) {
    const f = scheme.rooms[r.name];
    if (!f) continue;
    matched++;
    set(r, 'floorFinish', f.floor);
    set(r, 'wallFinish', f.walls);
    set(r, 'ceilingFinish', f.ceiling);
    set(r, 'woodworkColor', f.woodwork);
  }
  return matched;
}

function set(r: Room, key: 'floorFinish' | 'wallFinish' | 'ceilingFinish' | 'woodworkColor', v: string | undefined) {
  if (v) r[key] = v;
  else delete r[key];
}

/** Names of the rooms in a scheme, in a readable list ("Kitchen, Reception"). */
export function schemeRoomNames(scheme: Pick<FinishScheme, 'rooms'>): string {
  return Object.keys(scheme.rooms).join(', ');
}
