import { describe, expect, it } from 'vitest';
import type { Level, Opening, Vec2 } from '../model/types';
import { blankLevel } from '../geometry/testUtils';
import { addWall, defaultWallProps, findWallNear, wallEnds } from '../geometry/wallGraph';
import { detectRooms, syncRooms } from '../geometry/rooms';
import { pointInPolygon } from '../geometry/vec';
import { CATALOGUE } from '../catalogue/items';
import { newPlacedItem } from '../catalogue/catalogue';
import { runRules } from './engine';
import { buildSeedProject, LEVEL_IDS } from '../model/seed';
import { deleteWall } from '../geometry/wallGraph';
import type { RuleProject } from './context';

const project = { catalogueOverrides: [] };
const prm = { ...defaultWallProps(), structural: 'nonLoadBearing' as const };

function wall(L: Level, a: Vec2, b: Vec2) {
  addWall(L, a, b, prm);
}

/** A door in the wall passing through `at`, centred there. */
function door(L: Level, at: Vec2, extra: Partial<Opening> = {}, type: Opening['type'] = 'door'): Opening {
  const hit = findWallNear(L, at, 5);
  if (!hit) throw new Error(`no wall at ${at.x},${at.y}`);
  const [a] = wallEnds(L, hit.wall);
  const width = 800;
  const o: Opening = {
    id: `o${hit.wall.openings.length}-${Math.round(at.x)}-${Math.round(at.y)}`,
    type,
    offset: Math.hypot(hit.point.x - a.x, hit.point.y - a.y) - width / 2,
    width,
    height: 2000,
    sill: 0,
    existing: true,
    ...extra,
  };
  hit.wall.openings.push(o);
  return o;
}

function name(L: Level, at: Vec2, n: string) {
  const d = detectRooms(L).find((r) => !r.solid && pointInPolygon(at, r.inner))!;
  L.rooms.find((r) => r.boundary.join('|') === d.nodeIds.join('|'))!.name = n;
}

function put(L: Level, id: string, x: number, y: number) {
  L.items.push(newPlacedItem(CATALOGUE.find((c) => c.id === id)!, { x, y }, 0));
}

/**
 * Seed-like flat, 6 x 4 m. Bedroom on the left, then a hall, then the kitchen
 * (top right) and reception (bottom right). Front door on the bottom wall of the hall.
 *   with `hall: false` the hall wall is left out, so the bedroom door opens into
 *   one open kitchen-living room that also holds the front door.
 */
function flat(hall: boolean): Level {
  const L = blankLevel();
  wall(L, { x: 0, y: 0 }, { x: 6000, y: 0 });
  wall(L, { x: 6000, y: 0 }, { x: 6000, y: 4000 });
  wall(L, { x: 6000, y: 4000 }, { x: 0, y: 4000 });
  wall(L, { x: 0, y: 4000 }, { x: 0, y: 0 });
  wall(L, { x: 2000, y: 0 }, { x: 2000, y: 4000 });
  if (hall) {
    wall(L, { x: 3200, y: 0 }, { x: 3200, y: 4000 });
    wall(L, { x: 3200, y: 2000 }, { x: 6000, y: 2000 });
  }
  syncRooms(L);
  name(L, { x: 1000, y: 2000 }, 'Bedroom 1');
  door(L, { x: 2000, y: 1000 });
  if (hall) {
    name(L, { x: 2600, y: 2000 }, 'Hall');
    name(L, { x: 4500, y: 1000 }, 'Kitchen');
    name(L, { x: 4500, y: 3000 }, 'Reception');
    door(L, { x: 3200, y: 1000 });
    door(L, { x: 3200, y: 3000 });
    door(L, { x: 2600, y: 4000 }); // front door
    put(L, 'kitchen-hob', 4500, 300);
  } else {
    name(L, { x: 4000, y: 2000 }, 'Kitchen-living');
    door(L, { x: 4000, y: 4000 }); // front door
    put(L, 'kitchen-hob', 4500, 300);
  }
  put(L, 'bed-double', 800, 1500);
  return L;
}

const escapeIssues = (L: Level, prj: RuleProject = project) => runRules(L, prj).filter((i) => i.ruleId === 'fire-escape');

describe('fire-escape rule', () => {
  it('passes when the bedroom reaches the front door through a hall', () => {
    // No warning. The kitchen door onto the hall only gets the "check it is a fire door" note (see below).
    expect(escapeIssues(flat(true)).filter((i) => i.severity !== 'tip')).toEqual([]);
  });

  it('warns when the bedroom opens into an open kitchen-living room with the front door', () => {
    const issues = escapeIssues(flat(false));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].roomName).toBe('Bedroom 1');
    expect(issues[0].message).toContain('The way out from Bedroom 1 goes through');
    expect(issues[0].message).toContain('Ask Building Control');
    expect(issues[0].message).toContain('guidance, not a compliance check');
  });

  it('recognises a kitchen by its hob even when the room is not named kitchen', () => {
    const L = flat(false);
    name(L, { x: 4000, y: 2000 }, 'Living space');
    expect(escapeIssues(L).filter((i) => i.severity === 'warning')).toHaveLength(1);
    expect(escapeIssues({ ...L, items: L.items.filter((i) => i.catalogueId !== 'kitchen-hob') })).toEqual([]);
  });

  it('warns when the front door opens into the kitchen, or into an open kitchen-living room', () => {
    const L = flat(true);
    // The room next to the bedroom is the kitchen: bedroom, kitchen, hall is the only way.
    name(L, { x: 2600, y: 2000 }, 'Kitchen');
    // The front door opens into the kitchen itself, so every way out passes it.
    expect(escapeIssues(L).filter((i) => i.severity === 'warning')).toHaveLength(1);
    const L2 = flat(false);
    name(L2, { x: 4000, y: 2000 }, 'Kitchen-living');
    expect(escapeIssues(L2).filter((i) => i.severity === 'warning')).toHaveLength(1);
  });

  it('does not use windows or closed walls as routes', () => {
    const L = flat(false);
    const w = L.walls.find((x) => x.openings.some((o) => o.id.endsWith('-2000-1000')))!;
    w.openings[0].type = 'window';
    w.openings[0].sill = 900;
    expect(escapeIssues(L)).toEqual([]); // no route drawn at all: not this rule's business
  });

  it('adds an info note on a new opening that joins the kitchen to the route', () => {
    const L = flat(true);
    door(L, { x: 4500, y: 2000 }, { existing: undefined, type: 'opening', width: 1500 }, 'opening');
    const issues = escapeIssues(L);
    const note = issues.find((i) => i.message.includes('new opening'));
    expect(note).toBeTruthy();
    expect(note!.message).toContain('new opening');
    expect(note!.message).toContain('Reception');
    expect(note!.wallIds).toHaveLength(1);
    // The bedroom still reaches the front door through the hall.
    expect(issues.filter((i) => i.severity === 'warning')).toEqual([]);
  });

  it('uses the door she marked as the front door', () => {
    const L = flat(false);
    // A back door straight from the bedroom to outside would be guessed as an exit...
    door(L, { x: 0, y: 3000 });
    expect(escapeIssues(L)).toEqual([]);
    // ...until she marks the real front door.
    for (const w of L.walls) for (const o of w.openings) if (o.id.endsWith('-4000-4000')) o.isEntrance = true;
    const warn = escapeIssues({ ...L }).filter((i) => i.severity === 'warning');
    expect(warn).toHaveLength(1);
  });

  it('can be switched off in the settings', () => {
    expect(escapeIssues(flat(false)).length).toBe(1);
    const L = { ...flat(false) };
    const off = runRules(L, project, { overrides: { 'fire-escape': { on: 0 } } }).filter((i) => i.ruleId === 'fire-escape');
    expect(off).toEqual([]);
  });

  it('says so when no front door can be found', () => {
    const L = flat(true);
    for (const w of L.walls) w.openings = w.openings.filter((o) => !o.id.endsWith('-2600-4000'));
    const issues = escapeIssues(L);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('Front door of the flat');
  });

  describe('over two floors', () => {
    function ground(): Level {
      const G = blankLevel();
      G.id = 'g';
      G.name = 'Ground';
      wall(G, { x: 0, y: 0 }, { x: 3000, y: 0 });
      wall(G, { x: 3000, y: 0 }, { x: 3000, y: 3000 });
      wall(G, { x: 3000, y: 3000 }, { x: 0, y: 3000 });
      wall(G, { x: 0, y: 3000 }, { x: 0, y: 0 });
      syncRooms(G);
      name(G, { x: 1500, y: 1500 }, 'Entrance hall');
      door(G, { x: 1500, y: 3000 });
      G.stairs.push({ id: 's1', pos: { x: 1500, y: 1500 }, rotationDeg: 0, width: 800, length: 2400, toLevelId: 'up', direction: 'up' });
      return G;
    }
    function upstairs(hall: boolean, stairAt: Vec2): Level {
      const U = flat(hall);
      U.id = 'up';
      U.name = 'Upstairs';
      U.elevation = 2700;
      for (const w of U.walls) w.openings = w.openings.filter((o) => !/-(2600|4000)-4000$/.test(o.id)); // no door to outside up here
      U.stairs.push({ id: 's2', pos: stairAt, rotationDeg: 0, width: 800, length: 2400, toLevelId: 'g', direction: 'down' });
      return U;
    }
    const prj = (levels: Level[]) => ({ catalogueOverrides: [], levels });
    const warnings = (level: Level, levels: Level[]) => escapeIssues(level, prj(levels)).filter((i) => i.severity === 'warning');

    it('passes when the stair is reached through the hall', () => {
      const U = upstairs(true, { x: 2600, y: 2000 });
      expect(warnings(U, [ground(), U])).toEqual([]);
    });

    it('warns when the stair is inside the open kitchen-living room', () => {
      const U = upstairs(false, { x: 4000, y: 2000 });
      const w = warnings(U, [ground(), U]);
      expect(w).toHaveLength(1);
      expect(w[0].roomName).toBe('Bedroom 1');
    });
  });

  describe('kitchen that opens onto the stairs or hall', () => {
    const onto = (L: Level, prj: RuleProject = project) => escapeIssues(L, prj).filter((i) => i.message.includes('opens onto'));

    it('gives an info note when the kitchen joins the hall by a door', () => {
      const n = onto(flat(true));
      expect(n).toHaveLength(1);
      expect(n[0].severity).toBe('tip');
      expect(n[0].roomName).toBe('Kitchen');
      expect(n[0].message).toContain('The kitchen opens onto the hall, which is the way out from the bedrooms.');
      expect(n[0].message).toContain('FD30, self-closing');
      expect(n[0].message).toContain('Ask Building Control');
      expect(n[0].message).toContain('check it is');
    });

    it('warns when the kitchen joins the hall by a cased opening with no door', () => {
      const L = flat(true);
      for (const w of L.walls) for (const o of w.openings) if (o.id.endsWith('-3200-1000')) o.type = 'opening';
      const n = onto(L);
      expect(n).toHaveLength(1);
      expect(n[0].severity).toBe('warning');
      expect(n[0].message).toContain('The open kitchen opens onto the hall');
      expect(n[0].message).toContain('The joining opening has no door');
      expect(n[0].wallIds).toHaveLength(1);
    });

    it('says nothing when no bedroom uses that hall, or the kitchen is closed off', () => {
      const L = flat(true);
      L.items = L.items.filter((i) => !i.catalogueId.startsWith('bed-'));
      name(L, { x: 1000, y: 2000 }, 'Study');
      expect(onto(L)).toEqual([]);
      const closed = flat(true);
      for (const w of closed.walls) w.openings = w.openings.filter((o) => !o.id.endsWith('-3200-1000'));
      expect(onto(closed)).toEqual([]);
    });

    it('does not report the kitchen that has the front door itself', () => {
      expect(onto(flat(false))).toEqual([]);
    });

    describe('on the seed', () => {
      const first = (p: ReturnType<typeof buildSeedProject>) => p.levels.find((l) => l.id === LEVEL_IDS.first)!;
      const prj = (p: ReturnType<typeof buildSeedProject>) => ({ catalogueOverrides: [], levels: p.levels });

      /** Seed with the kitchen/reception partition taken out. The merged room keeps one of the two names. */
      function opened() {
        const p = buildSeedProject();
        const L = first(p);
        const pos = new Map(L.nodes.map((n) => [n.id, n.pos] as const));
        for (const w of [...L.walls]) {
          const a = pos.get(w.a)!;
          const b = pos.get(w.b)!;
          if (a.y === 3370 && b.y === 3370 && Math.max(a.x, b.x) <= 2860) deleteWall(L, w.id);
        }
        syncRooms(L);
        return { p, L };
      }

      it('notes the kitchen door onto the stairs as it is today', () => {
        const p = buildSeedProject();
        const n = onto(first(p), prj(p));
        expect(n.length).toBeGreaterThan(0);
        expect(n.every((i) => i.severity === 'tip')).toBe(true);
        expect(n[0].message).toContain('opens onto the stairs, which are the way out from the bedrooms');
      });

      it('with the kitchen/reception wall removed, the open kitchen onto the stairs is an info note while the joints are doors', () => {
        const { p, L } = opened();
        L.rooms[0].name = 'Kitchen';
        const n = onto(L, prj(p));
        expect(n).toHaveLength(1);
        expect(n[0].severity).toBe('tip');
        expect(n[0].roomName).toBe('Kitchen');
        expect(n[0].message).toContain('The open kitchen opens onto the stairs, which are the way out from the bedrooms.');
        expect(n[0].message).toContain('A fire in the kitchen could block them.');
        expect(n[0].message).toContain('check it is');
        // No new "way out goes through the kitchen" warning: the bedrooms still leave by the stair.
        expect(escapeIssues(L, prj(p)).filter((i) => i.severity === 'warning')).toEqual([]);
      });

      it('with the wall out the merged room is called Reception, so it counts as the kitchen once a hob is in it', () => {
        const { p, L } = opened();
        expect(L.rooms.map((r) => r.name)).toEqual(['Reception']);
        expect(onto(L, prj(p))).toEqual([]); // no cooking yet
        put(L, 'kitchen-hob', 1400, 1000);
        const n = onto(L, prj(p));
        expect(n).toHaveLength(1);
        expect(n[0].roomName).toBe('Reception');
        expect(n[0].message).toContain('The open kitchen opens onto the stairs'); // 20 m² or more: open plan
      });

      it('becomes a warning if the open kitchen joins the stairs by a cased opening', () => {
        const { p, L } = opened();
        L.rooms[0].name = 'Kitchen';
        for (const w of L.walls) for (const o of w.openings) if (o.type === 'door') o.type = 'opening';
        const n = onto(L, prj(p));
        expect(n).toHaveLength(1);
        expect(n[0].severity).toBe('warning');
        expect(n[0].message).toContain('The open kitchen opens onto the stairs');
      });
    });
  });
});
