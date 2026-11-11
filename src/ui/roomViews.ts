// Room views: frame a room in 2D and 3D, or walk in through its door.
// The pure half (where to stand) is tested without a browser.

import type { Level, Vec2 } from '../model/types';
import { detectRooms, type DetectedRoom } from '../geometry/rooms';
import { computeJoints, type JointData } from '../geometry/joints';
import { pointInPolygon } from '../geometry/vec';
import { canvasApi } from '../editor2d/canvasApi';
import { requestRoomView } from '../view3d/captureBridge';

/** How far in from the door the walker stands, mm. */
export const DOOR_STAND_OFFSET = 700;

/**
 * Where to stand to walk into a room and what to face: just inside its first door,
 * looking at the middle of the room, or the middle of the room when it has no door.
 */
export function walkSpawn(level: Level, joints: JointData, room: DetectedRoom): { stand: Vec2; face: Vec2 } {
  const mid = room.label;
  const roomWalls = new Set(room.edges.map((e) => e.wallId));
  for (const w of level.walls) {
    if (!roomWalls.has(w.id)) continue;
    const o = joints.outlines.get(w.id);
    if (!o) continue;
    const door = w.openings.find((x) => x.type === 'door');
    if (!door) continue;
    const along = door.offset + door.width / 2;
    const c = { x: o.a.x + o.dir.x * along, y: o.a.y + o.dir.y * along };
    for (const sign of [1, -1]) {
      const stand = { x: c.x - o.dir.y * sign * DOOR_STAND_OFFSET, y: c.y + o.dir.x * sign * DOOR_STAND_OFFSET };
      if (pointInPolygon(stand, room.inner)) return { stand, face: mid };
    }
  }
  return { stand: mid, face: { x: mid.x, y: mid.y - 1000 } };
}

/** The detected room that a stored room (the selection) stands for. */
export function detectedFor(level: Level, roomId: string): DetectedRoom | undefined {
  const stored = level.rooms.find((r) => r.id === roomId);
  if (!stored) return undefined;
  const key = stored.boundary.join('|');
  return detectRooms(level).find((d) => d.nodeIds.join('|') === key);
}

/** Fit the plan to one room, and point the 3D overview at it for when 3D is open. */
export function frameRoom(level: Level, room: DetectedRoom): void {
  canvasApi.fitPoints(room.inner, 500);
  requestRoomView({ kind: 'frame', levelId: level.id, polygon: room.inner });
}

/** Switch to 3D and stand inside the room, near its door. */
export function walkIntoRoom(level: Level, room: DetectedRoom, openThreeD: () => void): void {
  const { stand, face } = walkSpawn(level, computeJoints(level), room);
  requestRoomView({ kind: 'walk', levelId: level.id, polygon: room.inner, stand, face });
  openThreeD();
}
