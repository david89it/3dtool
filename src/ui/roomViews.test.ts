import { describe, expect, it } from 'vitest';
import { addWall, defaultWallProps } from '../geometry/wallGraph';
import { addOpening } from '../geometry/openingEdits';
import { blankLevel } from '../geometry/testUtils';
import { computeJoints } from '../geometry/joints';
import { detectRooms } from '../geometry/rooms';
import { pointInPolygon } from '../geometry/vec';
import { DOOR_STAND_OFFSET, walkSpawn } from './roomViews';

function box(withDoor: boolean) {
  const L = blankLevel();
  const p = defaultWallProps('internal');
  const bottom = addWall(L, { x: 0, y: 3000 }, { x: 4000, y: 3000 }, p)[0];
  addWall(L, { x: 4000, y: 3000 }, { x: 4000, y: 0 }, p);
  addWall(L, { x: 4000, y: 0 }, { x: 0, y: 0 }, p);
  addWall(L, { x: 0, y: 0 }, { x: 0, y: 3000 }, p);
  if (withDoor) addOpening(L, bottom, 'door', 1000, 900);
  const joints = computeJoints(L);
  const room = detectRooms(L, joints).find((r) => !r.solid)!;
  return { L, joints, room };
}

describe('walkSpawn', () => {
  it('stands just inside the door, facing the middle of the room', () => {
    const { L, joints, room } = box(true);
    const s = walkSpawn(L, joints, room);
    expect(pointInPolygon(s.stand, room.inner)).toBe(true);
    // The door is at x = 1000 on the bottom wall (y = 3000): the walker is above it by about the offset.
    expect(Math.abs(s.stand.x - 1000)).toBeLessThan(50);
    expect(s.stand.y).toBeGreaterThan(3000 - DOOR_STAND_OFFSET - 100);
    expect(s.stand.y).toBeLessThan(3000 - DOOR_STAND_OFFSET + 100);
    expect(s.face).toEqual(room.label);
  });

  it('stands in the middle of a room with no door', () => {
    const { L, joints, room } = box(false);
    expect(walkSpawn(L, joints, room).stand).toEqual(room.label);
  });
});
