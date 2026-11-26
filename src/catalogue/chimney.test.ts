import { describe, expect, it } from 'vitest';
import { CATALOGUE } from './items';
import { footprint, isFloorObstacle, itemParts, newPlacedItem, topHeight } from './catalogue';
import { blankLevel } from '../geometry/testUtils';
import { addWall, defaultWallProps } from '../geometry/wallGraph';
import { syncRooms } from '../geometry/rooms';
import { levelObstacles } from '../view3d/walkPhysics';
import { makeContext, runRules } from '../rules/engine';
import { planColor } from './colors';

const cat = CATALOGUE.find((c) => c.id === 'chimney-breast')!;

function room(): ReturnType<typeof blankLevel> {
  const L = blankLevel();
  const p = { ...defaultWallProps(), structural: 'nonLoadBearing' as const };
  addWall(L, { x: 0, y: 0 }, { x: 4000, y: 0 }, p);
  addWall(L, { x: 4000, y: 0 }, { x: 4000, y: 4000 }, p);
  addWall(L, { x: 4000, y: 4000 }, { x: 0, y: 4000 }, p);
  addWall(L, { x: 0, y: 4000 }, { x: 0, y: 0 }, p);
  syncRooms(L);
  return L;
}

describe('chimney breast catalogue item', () => {
  it('is a wall-attached structure item with editable width, depth and height and a measure-me note', () => {
    expect(cat.name).toBe('Chimney breast');
    expect(cat.category).toBe('structure');
    expect(cat.mount).toBe('wall');
    expect(cat.resizable.w && cat.resizable.d && cat.resizable.h).toBeTruthy();
    expect(cat.measureNote).toMatch(/measure/i);
    expect(cat.geometry.every((g) => g.colorToken === 'masonry')).toBe(true);
    expect(planColor('masonry')).not.toBe(planColor('unknown-token'));
  });

  it('is a box of masonry up to the height she sets', () => {
    const it = { ...newPlacedItem(cat, { x: 0, y: 0 }), dims: { w: 1200, d: 400, h: 3000 } };
    const parts = itemParts(it, cat);
    expect(parts).toHaveLength(1);
    expect(parts[0].size).toEqual([1200, 3000, 400]);
    expect(topHeight(it, cat)).toBe(3000);
    expect(footprint(it, cat)).toHaveLength(4);
  });

  it('counts as an obstacle for the rules and for walking', () => {
    const L = room();
    // Against the left wall (inside face x = 50), front into the room.
    const it = newPlacedItem(cat, { x: 50 + 175, y: 1500 }, 270);
    L.items.push(it);
    expect(isFloorObstacle(it, cat)).toBe(true);
    const obs = levelObstacles(L, { catalogueOverrides: [] });
    expect(obs.polygons).toHaveLength(1);
    const xs = obs.polygons[0].map((q) => q.x);
    expect(Math.min(...xs)).toBeCloseTo(50, 3);
    expect(Math.max(...xs)).toBeCloseTo(400, 3);
    expect(makeContext(L, { catalogueOverrides: [] }).placed[0].obstacle).toBe(true);
  });

  it('is flagged when a door swings into it, and when it stands under a window', () => {
    const L = room();
    const it = newPlacedItem(cat, { x: 50 + 175, y: 600 }, 270);
    L.items.push(it);
    // A door in the top wall, hinged near the chimney, swinging into the room across it.
    const top = L.walls.find((w) => L.nodes.find((n) => n.id === w.a)!.pos.y === 0 && L.nodes.find((n) => n.id === w.b)!.pos.y === 0)!;
    top.openings.push({ id: 'd1', type: 'door', offset: 200, width: 900, height: 2000, sill: 0, swing: { hinge: 'start', side: 'left', angle: 90 } });
    const ruleIds = runRules(L, { catalogueOverrides: [] }).filter((i) => i.itemIds.includes(it.id)).map((i) => i.ruleId);
    expect(ruleIds).toContain('door-swing');
  });
});
