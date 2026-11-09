import { describe, expect, it } from 'vitest';
import type { Level, Opening, PlacedItem, Structural, Wall } from '../model/types';
import { blankLevel } from '../geometry/testUtils';
import { addWall, defaultWallProps, nodePos } from '../geometry/wallGraph';
import { syncRooms } from '../geometry/rooms';
import { CATALOGUE } from '../catalogue/items';
import { newPlacedItem } from '../catalogue/catalogue';
import { RULES } from './registry';
import { groupByRoom, runRules, type Issue } from './engine';
import { applyFix, fixIssue } from './fixers';

const project = { catalogueOverrides: [] };

/**
 * A room whose wall centrelines run from (0,0) to (W,H) with 100 mm walls,
 * so the inside faces are at x = 50 and W - 50, y = 50 and H - 50.
 * The "top" wall is y = 0; items with rotation 0 back onto it, facing +y.
 */
function room(W = 4000, H = 4000, structural: Structural = 'nonLoadBearing'): Level {
  const L = blankLevel();
  const p = { ...defaultWallProps(), structural };
  addWall(L, { x: 0, y: 0 }, { x: W, y: 0 }, p);
  addWall(L, { x: W, y: 0 }, { x: W, y: H }, p);
  addWall(L, { x: W, y: H }, { x: 0, y: H }, p);
  addWall(L, { x: 0, y: H }, { x: 0, y: 0 }, p);
  syncRooms(L);
  return L;
}

const cat = (id: string) => {
  const c = CATALOGUE.find((x) => x.id === id);
  if (!c) throw new Error(id);
  return c;
};

/** Place an item by its centre. */
function put(L: Level, id: string, x: number, y: number, rot = 0, extra: Partial<PlacedItem> = {}): PlacedItem {
  const it = { ...newPlacedItem(cat(id), { x, y }, rot), ...extra };
  L.items.push(it);
  return it;
}

/** Place an item with its back against the top wall (inside face y = 50). */
function againstTop(L: Level, id: string, x: number): PlacedItem {
  const d = cat(id).states ? Object.values(cat(id).states!)[0].dims.d : cat(id).defaultDims.d;
  return put(L, id, x, 50 + d / 2, 0);
}

function topWall(L: Level): Wall {
  return L.walls.find((w) => nodePos(L, w.a).y === 0 && nodePos(L, w.b).y === 0)!;
}

function addOpening(L: Level, o: Partial<Opening>): Opening {
  const op: Opening = { id: `o${Math.random()}`, type: 'window', offset: 1500, width: 1000, height: 1200, sill: 800, ...o };
  topWall(L).openings.push(op);
  return op;
}

const issues = (L: Level, ruleId: string): Issue[] => runRules(L, project).filter((i) => i.ruleId === ruleId);
const bad = (L: Level, ruleId: string) => issues(L, ruleId).filter((i) => i.severity !== 'tip');

describe('registry', () => {
  it('has all 22 rules from the brief', () => {
    expect(RULES.map((r) => r.id).sort()).toEqual(
      [
        'bed-side-access',
        'bed-foot',
        'bed-not-under-window-sill',
        'murphy-deploy',
        'wardrobe-hinged-front',
        'wardrobe-sliding-front',
        'drawer-pull',
        'walkway',
        'door-swing',
        'window-obstruction',
        'radiator-blocked',
        'kitchen-worktop-landing',
        'kitchen-sink-hob',
        'kitchen-aisle',
        'kitchen-triangle',
        'dining-chair-pullback',
        'sofa-tv-distance',
        'desk-chair',
        'wc-front',
        'basin-front',
        'structural-opening',
        'loft-headroom',
      ].sort(),
    );
  });
});

describe('rules: pass and fail', () => {
  it('bed-side-access: passes when there is room', () => {
    const ok = room();
    againstTop(ok, 'bed-double', 2000);
    expect(issues(ok, 'bed-side-access')).toHaveLength(0);
  });

  it('bed-side-access: flags the problem', () => {
    const tight = room();
    againstTop(tight, 'bed-double', 50 + 725 + 400); // 400 mm on its left
    const f = bad(tight, 'bed-side-access');
    expect(f).toHaveLength(1);
    expect(f[0].measured).toBe(400);
    expect(f[0].required).toBe(600);
    expect(f[0].message).toBe('Double bed side to wall: 400 mm. Needs 600 mm to get into bed.');
  });

  it('bed-side-access ignores a side pushed against the wall', () => {
    const L = room();
    againstTop(L, 'bed-double', 50 + 725); // right up against the left wall
    expect(issues(L, 'bed-side-access')).toHaveLength(0);
  });

  it('bed-foot: passes when there is room', () => {
    const ok = room();
    againstTop(ok, 'bed-double', 2000);
    expect(issues(ok, 'bed-foot')).toHaveLength(0);
  });

  it('bed-foot: flags the problem', () => {
    const short = room(4000, 2600); // foot gap = 2550 - 50 - 2050 = 450
    againstTop(short, 'bed-double', 2000);
    const f = bad(short, 'bed-foot');
    expect(f).toHaveLength(1);
    expect(f[0].measured).toBe(450);
  });

  it('bed-not-under-window-sill: passes when there is room', () => {
    const ok = room();
    addOpening(ok, { offset: 1500, sill: 1100 });
    againstTop(ok, 'bed-double', 2000);
    expect(issues(ok, 'bed-not-under-window-sill')).toHaveLength(0);
  });

  it('bed-not-under-window-sill: flags the problem', () => {
    const low = room();
    addOpening(low, { offset: 1500, sill: 800 });
    againstTop(low, 'bed-double', 2000);
    const f = bad(low, 'bed-not-under-window-sill');
    expect(f).toHaveLength(1);
    expect(f[0].message).toMatch(/headboard \(1000 mm\) is higher than the window sill behind it \(800 mm\)/);
  });

  it('murphy-deploy: passes when there is room', () => {
    const ok = room();
    againstTop(ok, 'bed-murphy', 2000);
    expect(issues(ok, 'murphy-deploy')).toHaveLength(0);
  });

  it('murphy-deploy: flags the problem', () => {
    const blocked = room();
    againstTop(blocked, 'bed-murphy', 2000);
    put(blocked, 'drawers-chest', 2000, 50 + 450 + 1000 + 225); // 1000 mm in front of the folded bed
    const f = bad(blocked, 'murphy-deploy');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('error');
    expect(f[0].required).toBe(1800); // 2150 - 450 + 100
    expect(f[0].measured).toBe(1000);
  });

  it('wardrobe-hinged-front: passes when there is room', () => {
    const ok = room();
    againstTop(ok, 'wardrobe-hinged', 2000);
    expect(issues(ok, 'wardrobe-hinged-front')).toHaveLength(0);
  });

  it('wardrobe-hinged-front: flags the problem', () => {
    const tight = room();
    againstTop(tight, 'wardrobe-hinged', 2000);
    put(tight, 'drawers-chest', 2000, 650 + 300 + 225); // 300 mm in front
    const f = bad(tight, 'wardrobe-hinged-front');
    expect(f).toHaveLength(1);
    expect(f[0].message).toBe('Wardrobe (hinged doors) to chest of drawers: 300 mm. Needs 500 mm to open the doors.');
  });

  it('wardrobe-sliding-front: passes when there is room', () => {
    const ok = room();
    againstTop(ok, 'wardrobe-sliding', 2000);
    expect(issues(ok, 'wardrobe-sliding-front')).toHaveLength(0);
  });

  it('wardrobe-sliding-front: flags the problem', () => {
    const tight = room(4000, 1200); // front at 700, far wall face at 1150 => 450
    againstTop(tight, 'wardrobe-sliding', 2000);
    expect(bad(tight, 'wardrobe-sliding-front')[0].measured).toBe(450);
  });

  it('drawer-pull: passes when there is room', () => {
    const ok = room();
    againstTop(ok, 'drawers-chest', 2000);
    expect(issues(ok, 'drawer-pull')).toHaveLength(0);
  });

  it('drawer-pull: flags the problem', () => {
    const tight = room(4000, 1050); // front at 500, wall at 1000 => 500, needs 700
    againstTop(tight, 'drawers-chest', 2000);
    const f = bad(tight, 'drawer-pull');
    expect(f[0].measured).toBe(500);
    expect(f[0].required).toBe(700);
  });

  it('walkway: passes when there is room', () => {
    const ok = room(6000, 6000);
    put(ok, 'sofa-3', 2000, 2000);
    put(ok, 'armchair', 2000 + 1100 + 1000 + 425, 2000);
    expect(issues(ok, 'walkway')).toHaveLength(0);
  });

  it('walkway: flags the problem', () => {
    const tight = room(6000, 6000);
    put(tight, 'sofa-3', 2000, 2000);
    put(tight, 'armchair', 2000 + 1100 + 500 + 425, 2000); // 500 mm gap
    const f = bad(tight, 'walkway');
    expect(f).toHaveLength(1);
    expect(f[0].measured).toBe(500);
  });

  it('door-swing: passes when there is room', () => {
    const ok = room();
    addOpening(ok, { type: 'door', offset: 1000, width: 800, sill: 0, height: 2000, swing: { hinge: 'start', side: 'left', angle: 90 } });
    put(ok, 'armchair', 3000, 2500);
    expect(issues(ok, 'door-swing')).toHaveLength(0);
  });

  it('door-swing: flags the problem', () => {
    const hit = room();
    addOpening(hit, { type: 'door', offset: 1000, width: 800, sill: 0, height: 2000, swing: { hinge: 'start', side: 'left', angle: 90 } });
    put(hit, 'armchair', 1400, 600);
    const f = bad(hit, 'door-swing');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('error');
    expect(f[0].message).toMatch(/door hits the armchair/);
  });

  it('window-obstruction: passes when there is room', () => {
    const ok = room();
    addOpening(ok, { offset: 1500, width: 1000 });
    againstTop(ok, 'bookcase', 3300);
    expect(issues(ok, 'window-obstruction')).toHaveLength(0);
  });

  it('window-obstruction: flags the problem', () => {
    const blocked = room();
    addOpening(blocked, { offset: 1500, width: 1000 });
    againstTop(blocked, 'bookcase', 2000);
    expect(bad(blocked, 'window-obstruction')).toHaveLength(1);
  });

  it('radiator-blocked: passes when there is room', () => {
    const ok = room();
    againstTop(ok, 'radiator', 2000);
    put(ok, 'sofa-3', 2000, 160 + 400 + 475); // back 400 mm from the radiator
    expect(issues(ok, 'radiator-blocked')).toHaveLength(0);
  });

  it('radiator-blocked: flags the problem', () => {
    const close = room();
    againstTop(close, 'radiator', 2000);
    put(close, 'sofa-3', 2000, 160 + 50 + 475); // 50 mm
    const f = bad(close, 'radiator-blocked');
    expect(f).toHaveLength(1);
    expect(f[0].measured).toBe(50);
  });

  it('kitchen-worktop-landing: passes when there is room', () => {
    const ok = room();
    againstTop(ok, 'kitchen-base-600', 400);
    againstTop(ok, 'kitchen-hob', 1000);
    againstTop(ok, 'kitchen-base-600', 1600);
    expect(issues(ok, 'kitchen-worktop-landing')).toHaveLength(0);
  });

  it('kitchen-worktop-landing: flags the problem', () => {
    const end = room();
    againstTop(end, 'kitchen-hob', 1000);
    againstTop(end, 'kitchen-base-600', 1600);
    const f = bad(end, 'kitchen-worktop-landing');
    expect(f).toHaveLength(1);
    expect(f[0].measured).toBe(0);
  });

  it('kitchen-sink-hob: passes when there is room', () => {
    const ok = room();
    againstTop(ok, 'kitchen-sink', 600);
    againstTop(ok, 'kitchen-base-600', 1400);
    againstTop(ok, 'kitchen-hob', 2000);
    expect(issues(ok, 'kitchen-sink-hob')).toHaveLength(0);
  });

  it('kitchen-sink-hob: flags the problem', () => {
    const tight = room();
    againstTop(tight, 'kitchen-sink', 600);
    againstTop(tight, 'kitchen-hob', 1400);
    expect(bad(tight, 'kitchen-sink-hob')[0].measured).toBe(0);
  });

  it('kitchen-aisle: passes when there is room', () => {
    const ok = room();
    againstTop(ok, 'kitchen-base-600', 2000);
    put(ok, 'kitchen-base-600', 2000, 650 + 1300 + 300, 180);
    expect(issues(ok, 'kitchen-aisle')).toHaveLength(0);
  });

  it('kitchen-aisle: flags the problem', () => {
    const tight = room();
    againstTop(tight, 'kitchen-base-600', 2000);
    put(tight, 'kitchen-base-600', 2000, 650 + 700 + 300, 180);
    const f = bad(tight, 'kitchen-aisle');
    expect(f).toHaveLength(1); // one issue for the pair, not two
    expect(f[0].measured).toBe(700);
  });

  it('kitchen-triangle: passes when there is room', () => {
    const ok = room(5000, 5000);
    againstTop(ok, 'kitchen-sink', 800);
    againstTop(ok, 'kitchen-hob', 2600);
    put(ok, 'fridge-freezer', 1700, 2000);
    expect(issues(ok, 'kitchen-triangle')).toHaveLength(0);
  });

  it('kitchen-triangle: flags the problem', () => {
    const squashed = room(5000, 5000);
    againstTop(squashed, 'kitchen-sink', 800);
    againstTop(squashed, 'kitchen-hob', 1600);
    put(squashed, 'fridge-freezer', 1700, 2000);
    const f = bad(squashed, 'kitchen-triangle');
    expect(f.length).toBeGreaterThanOrEqual(1);
    expect(f[0].message).toMatch(/sink to hob is 800 mm/);
  });

  it('dining-chair-pullback: passes when there is room', () => {
    const ok = room();
    put(ok, 'table-dining', 2000, 2000);
    expect(issues(ok, 'dining-chair-pullback')).toHaveLength(0);
  });

  it('dining-chair-pullback: flags the problem', () => {
    const tight = room();
    put(tight, 'table-dining', 50 + 400 + 800, 2000); // 400 mm from the left wall
    const f = bad(tight, 'dining-chair-pullback');
    expect(f).toHaveLength(1);
    expect(f[0].measured).toBe(400);
  });

  it('dining-chair-pullback ignores the chairs round the table', () => {
    const L = room();
    put(L, 'table-dining', 2000, 2000);
    put(L, 'chair-dining', 2000, 2000 + 450 + 200, 180);
    expect(issues(L, 'dining-chair-pullback')).toHaveLength(0);
  });

  it('sofa-tv-distance: passes when there is room', () => {
    const ok = room(5000, 5000);
    againstTop(ok, 'tv-unit', 2500);
    put(ok, 'sofa-3', 2500, 250 + 2800, 180);
    expect(issues(ok, 'sofa-tv-distance')).toHaveLength(0);
  });

  it('sofa-tv-distance: flags the problem', () => {
    const close = room(5000, 5000);
    againstTop(close, 'tv-unit', 2500);
    put(close, 'sofa-3', 2500, 250 + 1250, 180);
    expect(bad(close, 'sofa-tv-distance')).toHaveLength(1);
  });

  it('desk-chair: passes when there is room', () => {
    const ok = room();
    againstTop(ok, 'desk', 2000);
    expect(issues(ok, 'desk-chair')).toHaveLength(0);
  });

  it('desk-chair: flags the problem', () => {
    const tight = room(4000, 1250); // front at 650, wall at 1200 => 550
    againstTop(tight, 'desk', 2000);
    expect(bad(tight, 'desk-chair')[0].measured).toBe(550);
  });

  it('wc-front: passes when there is room', () => {
    const ok = room(2000, 2000);
    againstTop(ok, 'wc', 1000);
    expect(issues(ok, 'wc-front')).toHaveLength(0);
  });

  it('wc-front: flags the problem', () => {
    const tight = room(2000, 1200); // front at 700, wall at 1150 => 450
    againstTop(tight, 'wc', 1000);
    expect(bad(tight, 'wc-front')[0].measured).toBe(450);
  });

  it('basin-front: passes when there is room', () => {
    const ok = room(2000, 2000);
    againstTop(ok, 'basin', 1000);
    expect(issues(ok, 'basin-front')).toHaveLength(0);
  });

  it('basin-front: flags the problem', () => {
    const tight = room(2000, 1100); // front at 500, wall at 1050 => 550
    againstTop(tight, 'basin', 1000);
    expect(bad(tight, 'basin-front')[0].measured).toBe(550);
  });

  it('structural-opening: passes when there is room', () => {
    const ok = room(4000, 4000, 'unknown');
    addOpening(ok, { type: 'door', existing: true, sill: 0 });
    expect(issues(ok, 'structural-opening')).toHaveLength(0);
  });

  it('structural-opening: flags the problem', () => {
    const cut = room(4000, 4000, 'unknown');
    addOpening(cut, { type: 'opening', sill: 0 });
    const f = bad(cut, 'structural-opening');
    expect(f).toHaveLength(1);
    expect(f[0].message).toMatch(/needs engineer, steel and Building Control/);
    expect(f[0].fixable).toBe(false);
  });

  it('loft-headroom: passes when there is room', () => {
    const ok = room();
    againstTop(ok, 'wardrobe-hinged', 2000);
    expect(issues(ok, 'loft-headroom')).toHaveLength(0);
  });

  it('loft-headroom: flags the problem', () => {
    const low = room();
    low.ceilingHeight = 2000;
    againstTop(low, 'wardrobe-hinged', 2000);
    expect(bad(low, 'loft-headroom')).toHaveLength(1);
  });

  it('gives a tip between the minimum and the comfortable size', () => {
    const L = room(4000, 2800); // foot gap 2750 - 50 - 2050 = 650: above 600, below 800
    againstTop(L, 'bed-double', 2000);
    const f = issues(L, 'bed-foot');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('tip');
    expect(f[0].message).toBe('Double bed foot to wall: 650 mm. 800 mm would be more comfortable to walk past the end of the bed.');
  });

  it('rule values can be changed', () => {
    const L = room(4000, 2850);
    againstTop(L, 'bed-double', 2000);
    const f = runRules(L, project, { overrides: { 'bed-foot': { min: 750 } } }).filter((i) => i.ruleId === 'bed-foot');
    expect(f[0].severity).toBe('warning');
    expect(f[0].required).toBe(750);
  });

  it('groups by room, worst first', () => {
    const L = room(4000, 2600);
    againstTop(L, 'bed-double', 2000);
    addOpening(L, { type: 'door', offset: 100, width: 800, sill: 0, height: 2000, swing: { hinge: 'start', side: 'left', angle: 90 } });
    put(L, 'armchair', 3400, 1500);
    put(L, 'footstool', 600, 500); // in the door swing but not a door-swing item
    const groups = groupByRoom(runRules(L, project));
    expect(groups).toHaveLength(1);
    expect(groups[0].roomName).toBe('Room 1');
    const sev = groups[0].issues.map((i) => i.severity);
    expect([...sev].sort((a, b) => ['error', 'warning', 'tip'].indexOf(a) - ['error', 'warning', 'tip'].indexOf(b))).toEqual(sev);
  });

  it('is memoised per level object', () => {
    const L = room();
    againstTop(L, 'bed-double', 2000);
    expect(runRules(L, project)).toBe(runRules(L, project));
  });
});

describe('fixers', () => {
  it('nudges only the named item and clears the issue', () => {
    const L = room();
    addOpening(L, { type: 'door', offset: 1000, width: 800, sill: 0, height: 2000, swing: { hinge: 'start', side: 'left', angle: 90 } });
    const chair = put(L, 'armchair', 1400, 600);
    const other = put(L, 'sofa-3', 2500, 3000, 180);
    const before = { ...other.pos };
    const issue = bad(L, 'door-swing')[0];
    const fix = fixIssue(L, project, issue)!;
    expect(fix).not.toBeNull();
    expect(fix.moves.map((m) => m.itemId)).toEqual([chair.id]);
    const moved: Level = { ...L, items: L.items.map((i) => ({ ...i, pos: { ...i.pos } })) };
    applyFix(moved, fix);
    expect(bad(moved, 'door-swing')).toHaveLength(0);
    expect(moved.items.find((i) => i.id === other.id)!.pos).toEqual(before);
    const m = fix.moves[0];
    expect(Math.hypot(m.pos.x - 1400, m.pos.y - 600)).toBeLessThanOrEqual(1500);
  });

  it('moves a wardrobe along the wall clear of the chest in front', () => {
    const L = room();
    againstTop(L, 'wardrobe-hinged', 2000);
    put(L, 'drawers-chest', 2000, 650 + 300 + 225);
    const issue = bad(L, 'wardrobe-hinged-front')[0];
    const fix = fixIssue(L, project, issue)!;
    expect(fix).not.toBeNull();
    expect(fix.moves).toHaveLength(1);
    expect(issue.itemIds).toContain(fix.moves[0].itemId);
    const moved: Level = { ...L, items: L.items.map((i) => ({ ...i, pos: { ...i.pos } })) };
    applyFix(moved, fix);
    expect(bad(moved, 'wardrobe-hinged-front')).toHaveLength(0);
  });

  it('never moves a locked item', () => {
    const L = room();
    addOpening(L, { type: 'door', offset: 1000, width: 800, sill: 0, height: 2000, swing: { hinge: 'start', side: 'left', angle: 90 } });
    put(L, 'armchair', 1400, 600, 0, { locked: true });
    expect(fixIssue(L, project, bad(L, 'door-swing')[0])).toBeNull();
  });

  it('has no mechanical fix for structural openings or headroom', () => {
    const cut = room(4000, 4000, 'unknown');
    addOpening(cut, { type: 'opening', sill: 0 });
    expect(fixIssue(cut, project, bad(cut, 'structural-opening')[0])).toBeNull();
    const low = room();
    low.ceilingHeight = 2000;
    againstTop(low, 'wardrobe-hinged', 2000);
    expect(fixIssue(low, project, bad(low, 'loft-headroom')[0])).toBeNull();
  });
});
