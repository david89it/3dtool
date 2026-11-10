// Which room is on each side of a wall. L and R are the left and right of the
// wall drawn from node a to node b (the same sides as Wall.faces). A side with
// no entry faces no room (outside the flat, or solid masonry).

import type { Id, Level, Room } from './types';
import { detectRooms, type DetectedRoom } from '../geometry/rooms';

export interface SideRoom {
  /** The stored room, if the detected loop has one (it normally does). */
  room?: Room;
}
export type WallSides = { L?: SideRoom; R?: SideRoom };

/** The stored room that belongs to a detected loop. */
export function roomForLoop(level: Level, d: DetectedRoom | undefined): Room | undefined {
  if (!d) return undefined;
  return level.rooms.find((r) => r.boundary.join('|') === d.nodeIds.join('|'));
}

export function wallSideRooms(level: Level, detected?: DetectedRoom[]): Map<Id, WallSides> {
  const sides = new Map<Id, WallSides>();
  for (const r of detected ?? detectRooms(level)) {
    if (r.solid) continue;
    const room = roomForLoop(level, r);
    for (const e of r.edges) {
      const w = level.walls.find((x) => x.id === e.wallId);
      if (!w) continue;
      const entry = sides.get(w.id) ?? {};
      if (e.from === w.a) entry.L = { room };
      else entry.R = { room };
      sides.set(w.id, entry);
    }
  }
  return sides;
}

/** Set (or clear, with undefined) the paint on one face of a wall. Mutates, e.g. inside an immer recipe. */
export function setWallFace(wall: { faces?: { L?: string; R?: string } }, side: 'L' | 'R', finish: string | undefined): void {
  const next = { ...wall.faces };
  if (finish) next[side] = finish;
  else delete next[side];
  if (next.L || next.R) wall.faces = next;
  else delete wall.faces;
}

/** The room a wall face looks into, for plain wording; undefined when the face looks outside. */
export function faceRoomName(sides: WallSides | undefined, side: 'L' | 'R'): string | undefined {
  const s = sides?.[side];
  if (!s) return undefined;
  return s.room?.name ?? 'this room';
}
