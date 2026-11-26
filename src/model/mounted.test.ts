// Wall-hung items follow their wall (node drag, thickness, split, delete) in one undo step.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('idb-keyval', () => ({ get: vi.fn(async () => undefined), set: vi.fn(async () => undefined), del: vi.fn(async () => undefined) }));

import { useStore } from './store';
import type { Level, Project } from './types';
import { blankLevel } from '../geometry/testUtils';
import { addWall, defaultWallProps, deleteWall, setNodePos, splitWall } from '../geometry/wallGraph';
import { syncRooms } from '../geometry/rooms';

function setup() {
  const L = blankLevel();
  const p = { ...defaultWallProps(), structural: 'nonLoadBearing' as const };
  addWall(L, { x: 0, y: 0 }, { x: 4000, y: 0 }, p);
  addWall(L, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, p);
  addWall(L, { x: 4000, y: 3000 }, { x: 0, y: 3000 }, p);
  addWall(L, { x: 0, y: 3000 }, { x: 0, y: 0 }, p);
  syncRooms(L);
  const top = L.walls[0];
  // A radiator on the inside face of the top wall (faces +y), 1000 along.
  L.items.push({
    id: 'rad',
    catalogueId: 'radiator',
    pos: { x: 1000, y: top.thickness / 2 + 55 },
    rotationDeg: 0,
    dims: { w: 800, d: 110, h: 600 },
    mountedTo: { wallId: top.id, offset: 1000 },
  });
  // And a plain item that must never be touched.
  L.items.push({ id: 'sofa', catalogueId: 'sofa', pos: { x: 2000, y: 1500 }, rotationDeg: 0, dims: { w: 2000, d: 900, h: 800 } });
  const project: Project = { version: 1, name: 't', levels: [L], catalogueOverrides: [] };
  useStore.getState().loadProject(project);
  return { levelId: L.id, topId: top.id, bId: top.b };
}

const lvl = (id: string): Level => useStore.getState().project.levels.find((l) => l.id === id)!;
const item = (id: string, l: Level) => l.items.find((i) => i.id === id)!;

beforeEach(() => useStore.setState({ toasts: [] }));

describe('mounted items follow their wall', () => {
  it('follows a node drag in one undo step and leaves other items alone', () => {
    const { levelId, bId } = setup();
    const s = () => useStore.getState();
    const sofa = item('sofa', lvl(levelId));
    const before = s().past.length;
    s().beginGesture();
    // Drag the right end of the top wall down by 500 (the wall tilts).
    s().updateGesture((L) => setNodePos(L as Level, bId, { x: 4000, y: 500 }));
    s().endGesture('Move corner');
    expect(s().past.length).toBe(before + 1);
    const L = lvl(levelId);
    const rad = item('rad', L);
    const ang = Math.atan2(500, 4000);
    // Face normal is perpL(dir) = (-sin, cos); the centre sits 50 + 55 off the centreline.
    expect(rad.pos.x).toBeCloseTo(1000 * Math.cos(ang) - Math.sin(ang) * 105, 0);
    expect(rad.pos.y).toBeCloseTo(1000 * Math.sin(ang) + Math.cos(ang) * 105, 0);
    expect(rad.rotationDeg).toBe(Math.round((ang * 180) / Math.PI));
    expect(rad.mountedTo!.offset).toBe(1000);
    expect(item('sofa', L)).toEqual(sofa);
    s().undo();
    expect(item('rad', lvl(levelId)).pos).toEqual({ x: 1000, y: 105 });
    expect(item('rad', lvl(levelId)).rotationDeg).toBe(0);
  });

  it('keeps the face when the wall is thickened', () => {
    const { levelId, topId } = setup();
    const s = () => useStore.getState();
    s().editLevel('Thicker wall', (L) => void (L.walls.find((w) => w.id === topId)!.thickness = 300));
    const rad = item('rad', lvl(levelId));
    expect(rad.pos.x).toBeCloseTo(1000);
    expect(rad.pos.y).toBeCloseTo(150 + 55);
    s().undo();
    expect(item('rad', lvl(levelId)).pos.y).toBe(105);
  });

  it('clamps to the wall length when the wall gets shorter', () => {
    const { levelId, bId } = setup();
    const s = () => useStore.getState();
    s().editLevel('Shorter', (L) => setNodePos(L, bId, { x: 600, y: 0 }));
    const rad = item('rad', lvl(levelId));
    expect(rad.mountedTo!.offset).toBe(600);
    expect(rad.pos.x).toBeCloseTo(600);
  });

  it('moves to the right piece when the wall is split', () => {
    const { levelId, topId } = setup();
    const s = () => useStore.getState();
    s().editLevel('Split', (L) => void splitWall(L, topId, { x: 500, y: 0 }));
    const rad = item('rad', lvl(levelId));
    expect(rad.mountedTo!.wallId).not.toBe(topId);
    expect(rad.mountedTo!.offset).toBe(500);
    expect(rad.pos).toEqual({ x: 1000, y: 105 });
  });

  it('clears the mount but leaves the item when the wall is deleted', () => {
    const { levelId, topId } = setup();
    const s = () => useStore.getState();
    s().editLevel('Delete wall', (L) => void deleteWall(L, topId));
    const rad = item('rad', lvl(levelId));
    expect(rad.mountedTo).toBeUndefined();
    expect(rad.pos).toEqual({ x: 1000, y: 105 });
    s().undo();
    expect(item('rad', lvl(levelId)).mountedTo!.wallId).toBe(topId);
  });
});
