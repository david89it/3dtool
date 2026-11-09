import { describe, expect, it } from 'vitest';
import type { Level } from '../model/types';
import {
  addWall,
  defaultWallProps,
  deleteWall,
  mergeNodes,
  nodePos,
  setNodePos,
  settleNode,
  splitWall,
  wallsAt,
} from './wallGraph';
import { blankLevel } from './rooms.test';
import { detectRooms } from './rooms';
import { measureWallFace, setInternalLength, wallDimensions } from './dimensions';
import { computeJoints } from './joints';

function square(L: Level) {
  const p = defaultWallProps();
  addWall(L, { x: 0, y: 0 }, { x: 3000, y: 0 }, p);
  addWall(L, { x: 3000, y: 0 }, { x: 3000, y: 3000 }, p);
  addWall(L, { x: 3000, y: 3000 }, { x: 0, y: 3000 }, p);
  addWall(L, { x: 0, y: 3000 }, { x: 0, y: 0 }, p);
}

describe('wall graph', () => {
  it('shares nodes at corners', () => {
    const L = blankLevel();
    square(L);
    expect(L.nodes).toHaveLength(4);
    expect(L.walls).toHaveLength(4);
    for (const n of L.nodes) expect(wallsAt(L, n.id)).toHaveLength(2);
  });

  it('splits existing walls where a new wall starts on them or crosses them', () => {
    const L = blankLevel();
    square(L);
    addWall(L, { x: 1500, y: -500 }, { x: 1500, y: 3500 }, defaultWallProps());
    // the cross wall cuts top and bottom: 4 + 2 splits + 3 pieces of the new wall
    expect(L.walls).toHaveLength(9);
    expect(detectRooms(L).filter((r) => !r.solid)).toHaveLength(2);
  });

  it('moving a shared node moves every wall that uses it (graph stays connected)', () => {
    const L = blankLevel();
    square(L);
    const corner = L.nodes.find((n) => n.pos.x === 3000 && n.pos.y === 3000)!;
    setNodePos(L, corner.id, { x: 3500, y: 3200 });
    const ws = wallsAt(L, corner.id);
    expect(ws).toHaveLength(2);
    for (const w of ws) {
      const end = w.a === corner.id ? w.a : w.b;
      expect(nodePos(L, end)).toEqual({ x: 3500, y: 3200 });
    }
    expect(detectRooms(L).filter((r) => !r.solid)).toHaveLength(1);
  });

  it('moving a wall drags its connected walls with it', () => {
    const L = blankLevel();
    square(L);
    const right = L.walls.find((w) => nodePos(L, w.a).x === 3000 && nodePos(L, w.b).x === 3000)!;
    for (const id of [right.a, right.b]) {
      const p = nodePos(L, id);
      setNodePos(L, id, { x: p.x + 1000, y: p.y });
    }
    const rooms = detectRooms(L).filter((r) => !r.solid);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area).toBeCloseTo(3900 * 2900, -2);
  });

  it('splits a wall at a point and keeps openings on the correct piece', () => {
    const L = blankLevel();
    const [id] = addWall(L, { x: 0, y: 0 }, { x: 4000, y: 0 }, defaultWallProps());
    const w = L.walls.find((x) => x.id === id)!;
    w.openings.push({ id: 'o1', type: 'window', offset: 500, width: 800, height: 1200, sill: 900 });
    w.openings.push({ id: 'o2', type: 'door', offset: 3000, width: 800, height: 2000, sill: 0 });
    splitWall(L, id, { x: 2000, y: 10 });
    expect(L.walls).toHaveLength(2);
    const second = L.walls.find((x) => x.openings.some((o) => o.id === 'o2'))!;
    expect(second.openings[0].offset).toBe(1000);
    expect(L.walls.find((x) => x.openings.some((o) => o.id === 'o1'))!.openings[0].offset).toBe(500);
  });

  it('never splits through an opening', () => {
    const L = blankLevel();
    const [id] = addWall(L, { x: 0, y: 0 }, { x: 4000, y: 0 }, defaultWallProps());
    L.walls[0].openings.push({ id: 'o', type: 'door', offset: 1500, width: 1000, height: 2000, sill: 0 });
    const n = splitWall(L, id, { x: 1700, y: 0 });
    expect(nodePos(L, n).x).toBe(1500);
  });

  it('merges a dragged corner onto another and drops the collapsed wall', () => {
    const L = blankLevel();
    const p = defaultWallProps();
    addWall(L, { x: 0, y: 0 }, { x: 3000, y: 0 }, p);
    addWall(L, { x: 3000, y: 0 }, { x: 3000, y: 3000 }, p);
    const a = L.nodes.find((n) => n.pos.x === 3000 && n.pos.y === 3000)!;
    const b = L.nodes.find((n) => n.pos.x === 3000 && n.pos.y === 0)!;
    mergeNodes(L, b.id, a.id);
    expect(L.walls).toHaveLength(1);
    expect(L.nodes).toHaveLength(2);
  });

  it('settles a dropped corner onto a wall by splitting it', () => {
    const L = blankLevel();
    square(L);
    const [stub] = addWall(L, { x: 1500, y: 1500 }, { x: 1500, y: 2000 }, defaultWallProps());
    const w = L.walls.find((x) => x.id === stub)!;
    setNodePos(L, w.b, { x: 1500, y: 3000 });
    settleNode(L, w.b, 5);
    expect(wallsAt(L, w.b)).toHaveLength(3);
  });

  it('deleting a wall removes corners nothing else uses', () => {
    const L = blankLevel();
    const [id] = addWall(L, { x: 0, y: 0 }, { x: 1000, y: 0 }, defaultWallProps());
    deleteWall(L, id);
    expect(L.nodes).toHaveLength(0);
  });

  it('typing an internal length moves the far end of the wall', () => {
    const L = blankLevel();
    square(L);
    const J = computeJoints(L);
    const dims = wallDimensions(L, J, detectRooms(L, J));
    const top = L.walls.find((w) => nodePos(L, w.a).y === 0 && nodePos(L, w.b).y === 0)!;
    const d = dims.find((x) => x.wallId === top.id)!;
    expect(d.length).toBeCloseTo(2900, 3);
    setInternalLength(L, top.id, 3320, (lv) => measureWallFace(lv, top.id));
    const J2 = computeJoints(L);
    const d2 = wallDimensions(L, J2, detectRooms(L, J2)).find((x) => x.wallId === top.id)!;
    expect(d2.length).toBeCloseTo(3320, 3);
    // the far wall moved with it: room is still a rectangle
    const rooms = detectRooms(L).filter((r) => !r.solid);
    expect(rooms[0].area).toBeCloseTo(3320 * 2900, -2);
  });
});
